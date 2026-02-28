/**
 * SpacetimeDB node table uses `id` as a global primary key.
 * Namespace node IDs by rabbit hole for DB storage so the same canonical paper
 * can exist independently in multiple rabbit holes.
 */

export function toDbNodeId(rabbitHoleId: string, nodeId: string): string {
  const prefix = `${rabbitHoleId}::`;
  return nodeId.startsWith(prefix) ? nodeId : `${prefix}${nodeId}`;
}

export function fromDbNodeId(rabbitHoleId: string, dbNodeId: string): string {
  const prefix = `${rabbitHoleId}::`;
  return dbNodeId.startsWith(prefix) ? dbNodeId.slice(prefix.length) : dbNodeId;
}

