// core/src/wizardState.ts
// In-memory wizard state with TTL for each user

const WIZARD_TTL_MS = 30 * 60 * 1000; // 30 minutes

export interface WizardState {
	step?: string;
	mode?: 'inclusion' | 'exclusion';
	groups?: { id: string; name: string }[];
	expires: number;
}

const stateMap = new Map<string, WizardState>();

function setWizardState(userId: string, state: Partial<WizardState>) {
	const expires = Date.now() + WIZARD_TTL_MS;
	stateMap.set(userId, { ...stateMap.get(userId), ...state, expires });
}

function getWizardState(userId: string): WizardState | undefined {
	const state = stateMap.get(userId);
	if (!state) return undefined;
	if (Date.now() > state.expires) {
		stateMap.delete(userId);
		return undefined;
	}
	return state;
}

function clearWizardState(userId: string) {
	stateMap.delete(userId);
}

// Periodic cleanup
setInterval(() => {
	const now = Date.now();
	for (const [userId, state] of stateMap.entries()) {
		if (now > state.expires) stateMap.delete(userId);
	}
}, 60 * 1000);

export { setWizardState, getWizardState, clearWizardState };
