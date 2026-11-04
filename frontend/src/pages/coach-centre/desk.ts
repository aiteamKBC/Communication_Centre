import { post } from '../call-centre/api';
import type { DeskTarget } from './types';

/** Saves on a coach's desk: the coach's own endpoints, or the director's, which name the coach. */
export const saveOnDesk = <T,>(target: DeskTarget, action: 'caught-up' | 'do-not-call', payload: Record<string, unknown>) =>
  target.coach
    ? post<T>(`coaches/desk/${action}/`, '', { ...payload, coach: target.coach })
    : post<T>(`coach/${action}/`, '', payload);
