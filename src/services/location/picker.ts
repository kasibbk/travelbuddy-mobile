import type { AppCoords } from "./types";

type RideLocationSelection = (label: string, coords: AppCoords) => void;

let pendingSelection: {
  onSelect: RideLocationSelection;
  onCancel: () => void;
} | null = null;

export function beginRideLocationSelection(onSelect: RideLocationSelection, onCancel: () => void): void {
  pendingSelection = { onSelect, onCancel };
}

export function completeRideLocationSelection(label: string, coords: AppCoords): void {
  const pending = pendingSelection;
  pendingSelection = null;
  pending?.onSelect(label, coords);
}

export function cancelRideLocationSelection(): void {
  const pending = pendingSelection;
  pendingSelection = null;
  pending?.onCancel();
}
