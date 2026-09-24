import type { GameSettings } from '../game/settings';

export type RootStackParamList = {
  Login: undefined;
  Home: undefined;
  GameSetup: { mode: 'quick' | 'friends'; roomCode?: string };
  Table: { settings: GameSettings; seed: number; roomCode?: string; resume?: boolean };
  CreateJoin: undefined;
  Lobby: { roomCode: string; host: boolean; settings?: GameSettings };
  Friends: undefined;
  Stats: undefined;
  Profile: undefined;
  PalDesigner: undefined;
  Store: undefined;
  Settings: undefined;
};
