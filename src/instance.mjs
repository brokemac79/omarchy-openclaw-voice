export function resolveInstance(env = process.env) {
  const name = env.OPENCLAW_VOICE_INSTANCE ?? 'default';
  if (!/^[a-z0-9][a-z0-9_-]{0,31}$/.test(name)) throw new Error('Invalid voice instance.');
  const basename = name === 'default' ? 'openclaw-voice' : `openclaw-voice-${name}`;
  return Object.freeze({ name, basename, unit: `${basename}.service` });
}
