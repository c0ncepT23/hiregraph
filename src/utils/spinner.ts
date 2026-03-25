import ora, { type Ora } from 'ora';

let current: Ora | null = null;

export function start(text: string): Ora {
  if (current) current.stop();
  current = ora(text).start();
  return current;
}

export function succeed(text: string): void {
  if (current) {
    current.succeed(text);
    current = null;
  }
}

export function fail(text: string): void {
  if (current) {
    current.fail(text);
    current = null;
  }
}

export function stop(): void {
  if (current) {
    current.stop();
    current = null;
  }
}
