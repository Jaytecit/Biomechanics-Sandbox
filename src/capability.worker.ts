import { analyzeCapability } from './capability';
import { CreatureBlueprint } from './types';

self.onmessage = (event: MessageEvent<{ blueprint: CreatureBlueprint; seed: number }>) => {
  self.postMessage(analyzeCapability(event.data.blueprint, event.data.seed));
};
