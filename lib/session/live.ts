import {
  catalogIndex,
  describeLift,
  muscleGroup,
  type CatalogLift,
  type LiveWorkout,
} from "../workout-session.ts";
import { today } from "../tracking.ts";
import type { CardUnit } from "../share-cards.ts";
import type { SessionDraft } from "./model.ts";
// The existing live screen owns logging. This only advances its planned superset order.
export function completePlannedSet(
  live: LiveWorkout,
  setIndex: number,
  completedMs: number,
): LiveWorkout {
  const exercise = live.exercises[live.current],
    set = exercise.sets[setIndex],
    mark = !set.done;
  const exercises = live.exercises.map((e, i) =>
    i === live.current
      ? {
          ...e,
          sets: e.sets.map((s, j) =>
            j === setIndex
              ? {
                  ...s,
                  done: mark,
                  completedAt: mark
                    ? new Date(completedMs).toISOString()
                    : undefined,
                }
              : s,
          ),
        }
      : e,
  );
  let current = live.current,
    selected = exercises[current].sets.findIndex((s) => !s.done),
    rest = exercise.rest;
  if (mark && exercise.supersetGroup) {
    const members = exercises.flatMap((e, i) =>
      e.supersetGroup === exercise.supersetGroup ? [i] : [],
    );
    const later = members.find(
      (i) =>
        i > current &&
        exercises[i].sets[setIndex] &&
        !exercises[i].sets[setIndex].done,
    );
    if (later !== undefined) {
      current = later;
      selected = setIndex;
      rest = 0;
    } else {
      rest = Math.max(...members.map((i) => exercises[i].rest));
      const unfinished = members
        .flatMap((i) =>
          exercises[i].sets.flatMap((s, j) => (!s.done ? [{ i, j }] : [])),
        )
        .sort((a, b) => a.j - b.j || a.i - b.i)[0];
      if (unfinished) {
        current = unfinished.i;
        selected = unfinished.j;
      }
    }
  }
  return {
    ...live,
    exercises,
    current,
    selected: selected < 0 ? setIndex : selected,
    restEndsAt: mark
      ? rest
        ? completedMs + rest * 1000
        : null
      : live.restSetId === set.id
        ? null
        : live.restEndsAt,
    restLength: mark ? rest : live.restLength,
    restSetId: mark ? set.id : live.restSetId,
  };
}

export function planToLive(
  plan: SessionDraft,
  id: string,
  unit: CardUnit,
  catalog: CatalogLift[],
  startedAt: string,
): LiveWorkout {
  const index = catalogIndex([
    ...catalog,
    ...plan.exercises
      .filter((e) => !e.custom && !catalog.some((c) => c.id === e.exerciseId))
      .map((e) => ({
        id: e.exerciseId,
        name: e.name,
        equipment: e.equipment,
        primary_muscle: e.targetMuscle ?? e.muscleGroup.toLowerCase(),
      })),
  ]);
  return {
    id,
    serverPlan: true,
    name: plan.name,
    date: today(),
    unit,
    startedAt,
    current: 0,
    selected: 0,
    restEndsAt: null,
    restLength: plan.defaultRestSec,
    exercises: plan.exercises.map((e) => ({
      ...describeLift(
        { exercise: e.name, exercise_id: e.custom ? undefined : e.exerciseId },
        index,
      ),
      ...(e.custom
        ? { id: null, key: e.exerciseId, muscle: muscleGroup(e.targetMuscle) }
        : {}),
      targetMuscle:
        e.targetMuscle ?? index.get(e.exerciseId)?.primary_muscle ?? undefined,
      movementPattern: e.movementPattern,
      rest: e.restOverrideSec ?? plan.defaultRestSec,
      supersetGroup: e.supersetGroup,
      sets: Array.from({ length: e.targetSets }, () => ({
        id: crypto.randomUUID(),
        weightKg: e.weightKg,
        reps: e.repMin,
        rpe: 7,
        done: false,
      })),
    })),
  };
}
