/** Wire-protocol version. Bump when a socket event or REST body changes shape. */
export const PROTOCOL_VERSION = 1;

/** Returns true when a client protocol version can talk to this server. */
export function isCompatibleProtocol(clientVersion: number): boolean {
  return Number.isInteger(clientVersion) && clientVersion === PROTOCOL_VERSION;
}
