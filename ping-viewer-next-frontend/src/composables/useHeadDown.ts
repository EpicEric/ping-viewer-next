import {
  updateViewerSettings,
  viewerSettings,
  type Ping360HeadDown,
} from '@/composables/useViewerSettings';
import { computed, ref, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue';

export interface HeadDownDevice {
  device_type: string;
  slot: number | string;
}

interface SlotHeadDown {
  headDown: Ref<boolean>;
  synced: boolean;
}

const slots = new Map<number, SlotHeadDown>();

function headDownFor(slot: number, entries: Ping360HeadDown[] | undefined, fallback: boolean) {
  const specific = entries?.find((entry) => entry.slot === slot);
  return specific ? specific.head_down : fallback;
}

function ensure(slot: number) {
  const existing = slots.get(slot);
  if (existing) return existing;
  const state: SlotHeadDown = { headDown: ref(false), synced: false };
  slots.set(slot, state);
  watch(state.headDown, (value) => {
    if (value === state.synced) return;
    state.synced = value;
    updateViewerSettings({
      ping360_head_down: { slot, head_down: value },
    }).catch((error) => {
      console.error('Failed to save head-down setting:', error);
    });
  });
  return state;
}

function pull(slot: number) {
  const state = ensure(slot);
  const settings = viewerSettings.value;
  if (!settings) return;
  const value = headDownFor(slot, settings.ping360_head_down, settings.head_down);
  state.synced = value;
  state.headDown.value = value;
}

watch(viewerSettings, (settings) => {
  if (!settings) return;
  for (const slot of slots.keys()) pull(slot);
});

// Callers for one slot share the ref, so the plot flips with the checkbox
// before the service answers.
export function useHeadDown(
  device: MaybeRefOrGetter<HeadDownDevice | null | undefined>
) {
  const slotOf = () => {
    const current = toValue(device);
    if (current?.slot == null || current.slot === '') return null;
    const slot = Number(current.slot);
    return Number.isInteger(slot) ? slot : null;
  };

  watch(
    slotOf,
    (slot) => {
      if (slot !== null) pull(slot);
    },
    { immediate: true }
  );

  return computed({
    get() {
      const slot = slotOf();
      if (slot === null) return false;
      return ensure(slot).headDown.value;
    },
    set(value: boolean) {
      const slot = slotOf();
      if (slot === null) return;
      ensure(slot).headDown.value = value;
    },
  });
}
