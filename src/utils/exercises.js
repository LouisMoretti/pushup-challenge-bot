import { EXERCISE_TYPES } from '../db/schema.js';

export const exerciseChoices = Object.values(EXERCISE_TYPES).map(
    (exerciseType) => ({
        name: exerciseType,
        value: exerciseType,
    }),
);
