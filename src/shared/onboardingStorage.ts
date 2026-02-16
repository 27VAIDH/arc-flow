const ONBOARDING_KEY = "onboardingCompleted";

export async function isOnboardingCompleted(): Promise<boolean> {
  const result = await chrome.storage.local.get(ONBOARDING_KEY);
  return result[ONBOARDING_KEY] === true;
}

export async function setOnboardingCompleted(): Promise<void> {
  await chrome.storage.local.set({ [ONBOARDING_KEY]: true });
}
