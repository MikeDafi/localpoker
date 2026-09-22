export function restoredDealHandNumber(resuming: boolean, handNumber: number): number {
  return resuming ? handNumber : -1;
}

export function shouldAnimateDeal(animationsOff: boolean, handNumber: number, restoredHandNumber: number): boolean {
  return !animationsOff && handNumber !== restoredHandNumber;
}
