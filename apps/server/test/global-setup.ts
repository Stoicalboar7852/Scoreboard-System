// Vitest global setup for the server package. Later phases prepare the test database here.
export default async function globalSetup(): Promise<void> {
  process.env.NODE_ENV = 'test';
}
