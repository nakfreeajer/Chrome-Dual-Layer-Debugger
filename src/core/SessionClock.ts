export class SessionClock {
  now(): string {
    return new Date().toISOString();
  }
}
