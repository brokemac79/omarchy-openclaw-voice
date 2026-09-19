import test from 'node:test';
import assert from 'node:assert/strict';
import { Transcript, TRANSCRIPT_LIMIT } from '../src/transcript.mjs';

test('Talk text deltas append and finalized text replaces fragments for each speaker', () => {
  const transcript = new Transcript();
  for (const [type, text] of [['transcript.delta', 'What is '], ['transcript.delta', 'two plus two?'],
    ['transcript.done', 'What is two plus two?'], ['output.text.delta', 'It is '],
    ['output.text.delta', 'four.']]) transcript.accept({ type, payload: { text } });
  assert.deepEqual(transcript.get(), { user: 'What is two plus two?', assistant: 'It is four.' });
  transcript.accept({ type: 'output.text.done', payload: { text: 'Four.' } });
  assert.equal(transcript.get().assistant, 'Four.');
});

test('replayed and older sequence numbers cannot duplicate or replace current text', () => {
  const transcript = new Transcript();
  const event = { type: 'output.text.delta', seq: 10, payload: { text: 'Current' } };
  transcript.accept(event); transcript.accept(event);
  assert.equal(transcript.accept({ ...event, seq: 9, payload: { text: 'Older' } }), false);
  assert.equal(transcript.get().assistant, 'Current');
});

test('a new utterance replaces the old user/reply pair, even when turn IDs are reused', () => {
  const transcript = new Transcript();
  transcript.accept({ type: 'transcript.done', turnId: 'turn-1', payload: { text: 'First question' } });
  transcript.accept({ type: 'output.text.done', turnId: 'turn-1', payload: { text: 'First answer' } });
  transcript.accept({ type: 'transcript.delta', turnId: 'turn-1', payload: { text: 'Next question' } });
  assert.deepEqual(transcript.get(), { user: 'Next question', assistant: '' });
  transcript.accept({ type: 'transcript.done', turnId: 'turn-1', payload: { text: 'Next question?' } });
  assert.equal(transcript.get().user, 'Next question?');
});

test('new items or turns reset partial text when a final event was not received', () => {
  const transcript = new Transcript();
  transcript.accept({ type: 'transcript.delta', itemId: 'item-1', payload: { text: 'Interrupted' } });
  transcript.accept({ type: 'transcript.delta', itemId: 'item-2', payload: { text: 'Replacement' } });
  assert.equal(transcript.get().user, 'Replacement');
  transcript.accept({ type: 'output.text.delta', turnId: 'turn-1', payload: { text: 'Old' } });
  transcript.accept({ type: 'output.text.delta', turnId: 'turn-2', payload: { text: 'New' } });
  assert.equal(transcript.get().assistant, 'New');
});

test('tool data and unknown speakers are not shown as conversation', () => {
  const transcript = new Transcript();
  transcript.accept({ type: 'tool.result', payload: { text: 'Not speech' } });
  transcript.accept({ type: 'transcript.delta', payload: { role: 'system', text: 'Not user speech' } });
  assert.deepEqual(transcript.get(), { user: '', assistant: '' });
});

test('streaming text stays bounded and clearing permits a fresh sequence', () => {
  const transcript = new Transcript();
  transcript.accept({ type: 'output.text.delta', seq: 99, payload: { delta: 'x'.repeat(10000) } });
  assert.equal(transcript.get().assistant.length, TRANSCRIPT_LIMIT);
  transcript.clear();
  assert.deepEqual(transcript.get(), { user: '', assistant: '' });
  assert.equal(transcript.accept({ type: 'transcript.done', seq: 1, payload: { text: 'Fresh' } }), true);
});

test('delayed input transcription preserves an already streaming or completed reply', () => {
  for (const done of [false, true]) {
    const transcript = new Transcript();
    transcript.accept({ type: done ? 'output.text.done' : 'output.text.delta', seq: 1,
      turnId: 'turn-1', payload: { text: done ? 'The answer is four.' : 'The answer is ' } });
    transcript.accept({ type: 'transcript.done', seq: 2, turnId: 'turn-1', payload: { text: 'Two plus two?' } });
    if (!done) transcript.accept({ type: 'output.text.delta', seq: 3, turnId: 'turn-1', payload: { text: 'four.' } });
    assert.deepEqual(transcript.get(), { user: 'Two plus two?', assistant: 'The answer is four.' });
  }
});

test('delayed input for a new turn preserves that turn\'s reply but clears an unrelated reply', () => {
  const transcript = new Transcript();
  transcript.accept({ type: 'transcript.done', turnId: 'old', payload: { text: 'Old question' } });
  transcript.accept({ type: 'output.text.delta', turnId: 'new', payload: { text: 'New answer' } });
  transcript.accept({ type: 'transcript.done', turnId: 'new', payload: { text: 'New question' } });
  assert.equal(transcript.get().assistant, 'New answer');
  transcript.clear();
  transcript.accept({ type: 'output.text.done', turnId: 'old', payload: { text: 'Old answer' } });
  transcript.accept({ type: 'transcript.delta', turnId: 'new', payload: { text: 'New question' } });
  assert.equal(transcript.get().assistant, '');
});
