export function toggleArrayFilter<T>(current: T[], value: T): T[] {
  const index = current.indexOf(value);
  if (index === -1) {
    return [...current, value];
  }
  return current.filter((_, i) => i !== index);
}

export function matchesStateFilter(peerState: string, selectedStates: string[]): boolean {
  if (selectedStates.length === 0) return true;
  if (selectedStates.includes("Down")) {
    return peerState !== "Established";
  }
  return selectedStates.includes(peerState);
}

export function matchesRoleFilter(peerRole: string, selectedRoles: string[]): boolean {
  if (selectedRoles.length === 0) return true;
  return selectedRoles.includes(peerRole);
}

export function matchesAddressFamilyFilter(peerAf: string, selectedAfs: string[]): boolean {
  if (selectedAfs.length === 0) return true;
  return selectedAfs.includes(peerAf);
}
