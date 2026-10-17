import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { Transcript, ANSWER_LIMIT, TRANSCRIPT_LIMIT } from '../src/transcript.mjs';
import { EngineOwner } from '../src/engine-owner.mjs';
import { createState } from '../src/state.mjs';

const event = (type, text, seq, turnId = 'synthetic-turn') => ({ type, seq, turnId, payload: { text } });

test('answer keeps the beginning and complete received reply independently of the compact tail', () => {
  const transcript = new Transcript();
  const full = 'Introduction\n' + 'Synthetic line.\n'.repeat(300) + 'End.';
  transcript.accept(event('output.text.delta', full.slice(0, 3000), 1));
  transcript.accept(event('output.text.delta', full.slice(3000), 2));
  assert.deepEqual(transcript.getAnswer(), { text: full, truncated: false, complete: false });
  assert.equal(transcript.get().assistant, full.slice(-TRANSCRIPT_LIMIT));
  transcript.accept(event('output.text.done', 'Replacement final\n' + full, 3));
  assert.equal(transcript.getAnswer().text, 'Replacement final\n' + full);
  assert.equal(transcript.getAnswer().complete, true);
  assert.equal(transcript.accept(event('output.text.done', 'Old replay', 2)), false);
  assert.equal(transcript.getAnswer().text, 'Replacement final\n' + full);
});

test('answer bounds overflow without splitting emoji, and final replacement can remove truncation', () => {
  const transcript = new Transcript();
  transcript.accept(event('output.text.delta', 'x'.repeat(ANSWER_LIMIT - 1) + '😀tail', 1));
  assert.equal(transcript.getAnswer().text, 'x'.repeat(ANSWER_LIMIT - 1));
  assert.equal(transcript.getAnswer().truncated, true);
  transcript.accept(event('output.text.delta', 'ignored overflow', 2));
  assert.equal(transcript.getAnswer().text.length, ANSWER_LIMIT - 1);
  transcript.accept(event('output.text.done', 'Final 😀\n```js\nconst n = 1;\n```', 3));
  assert.equal(transcript.getAnswer().truncated, false);
  assert.match(transcript.getAnswer().text, /Final 😀/);
  transcript.accept(event('output.text.done', 'y'.repeat(ANSWER_LIMIT + 1), 4));
  assert.equal(transcript.getAnswer().text.length, ANSWER_LIMIT);
  assert.equal(transcript.getAnswer().truncated, true);
  transcript.accept(event('output.text.done', '', 5));
  assert.deepEqual(transcript.getAnswer(), { text: '', truncated: false, complete: true });
});

test('new utterances, delayed input and explicit clearing do not mix answers', () => {
  const transcript = new Transcript();
  transcript.accept(event('output.text.delta', 'New reply', 1));
  transcript.accept(event('transcript.done', 'Delayed question', 2));
  assert.equal(transcript.getAnswer().text, 'New reply');
  transcript.accept(event('output.text.delta', 'Other reply', 3, 'other'));
  assert.equal(transcript.getAnswer().text, 'Other reply');
  transcript.accept(event('transcript.done', 'Other question', 4, 'other'));
  assert.equal(transcript.getAnswer().text, 'Other reply');
  transcript.clearAnswer();
  transcript.accept(event('output.text.delta', 'Only newly received', 5, 'other'));
  assert.equal(transcript.getAnswer().text, 'Only newly received');
  transcript.clear();
  assert.equal(transcript.getAnswer().text, '');
});

test('partial and final answers survive End/failure, remain under their destination and clear on dismiss/new call/shutdown', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'voice-answer-'));
  const native = await createState(directory);
  let launches = 0, closes = 0;
  const owner = new EngineOwner({ native, session: { close: async () => {} },
    getDestination: () => ({ destination: { label: 'Synthetic original', state: 'ready' } }),
    launch: async () => { launches++; return { start: async () => {}, close: async () => { closes++; } }; } });
  try {
    for (const final of [false, true]) {
      await owner.start();
      const text = 'Start\n' + 'Synthetic multiline 😀\n'.repeat(300);
      owner.talk(event(final ? 'output.text.done' : 'output.text.delta', text, 1));
      await owner.stop(final ? undefined : 'Synthetic audio failure');
      assert.equal(native.get().answer.text, text);
      assert.equal(native.get().answer.complete, final);
      assert.equal(native.get().assistant, '');
      assert.equal(native.get().destination.label, 'Synthetic original');
      assert.equal(native.get().reviewRequired, true);
      owner.talk(event('output.text.done', 'Late old answer', 2));
      assert.equal(native.get().answer.text, text);
      owner.dismissResult();
      assert.equal(native.get().answer.text, '');
      assert.equal(native.get().reviewRequired, false);
    }
    assert.equal(launches, 2); assert.equal(closes, 2);
    await owner.start();
    assert.equal(native.get().answer.text, '');
    owner.talk(event('output.text.done', 'Before next call', 1));
    await owner.stop(); await owner.start();
    assert.equal(native.get().answer.text, '');
    await owner.stop(); await native.close();
    const saved = JSON.parse(await readFile(join(directory, 'state.json'), 'utf8'));
    assert.equal(saved.answer, undefined);
    assert.equal(saved.lastResult, undefined);
  } finally { await owner.stop(); await native.close(); await rm(directory, { recursive: true, force: true }); }
});

test('state exports only bounded answer fields with explicit overflow', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'voice-answer-state-'));
  const native = await createState(directory);
  try {
    native.set('idle', 'Microphone off', {}, { answer: { text: 'x'.repeat(ANSWER_LIMIT - 1) + '😀',
      complete: true, token: 'synthetic-secret', url: 'synthetic-secret' } });
    assert.equal(native.get().answer.text.length, ANSWER_LIMIT - 1);
    assert.equal(native.get().answer.truncated, true);
    assert.deepEqual(Object.keys(native.get().answer).sort(), ['complete', 'text', 'truncated']);
    assert.ok(!JSON.stringify(native.get()).includes('synthetic-secret'));
  } finally { await native.close(); await rm(directory, { recursive: true, force: true }); }
});

test('web links are bounded, deduplicated and restricted to explicit ordinary http(s) destinations', async () => {
  const source = await readFile(new URL('../AnswerText.js', import.meta.url), 'utf8');
  const context = vm.createContext({}); vm.runInContext(source.replace('.pragma library', ''), context);
  assert.equal(context.answerLimit, ANSWER_LIMIT);
  const credentialLink = new URL('https://example.com');
  credentialLink.username = 'synthetic'; credentialLink.password = 'synthetic';
  for (const url of ['https://example.com/a?q=one#part', 'http://example.org', 'https://[::1]/']) assert.equal(context.safeLink(url), true, url);
  for (const url of ['file:///tmp/a', 'javascript:alert(1)', 'data:text/html,x', 'ftp://example.com',
    credentialLink.href, 'https://example.com\\file', 'https://exa%6dple.com',
    'https://example.com/\nfile', 'https://example.com/<html>', 'https://example.com/"bad"',
    'https://example.com/' + 'x'.repeat(2048)]) assert.equal(context.safeLink(url), false, url);
  const links = Array.from(context.links('[Source](https://example.com/doc). https://example.com/doc https://example.com/a_(b). <b>literal</b>'));
  assert.deepEqual(links, ['https://example.com/doc', 'https://example.com/a_(b)']);
  assert.equal(context.links(Array.from({ length: 30 }, (_, n) => 'https://example.com/' + n).join('\n')).length, 12);
  assert.equal(context.links('x'.repeat(ANSWER_LIMIT) + ' https://example.com').length, 0);
});
