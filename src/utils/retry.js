function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(task, options = {}) {
  const {
    attempts = 3,
    baseDelayMs = 500,
    backoffMultiplier = 2,
    maxDelayMs = 4000,
    shouldRetry = () => true,
    onRetry = () => {},
  } = options;

  let attempt = 0;
  let lastError;

  while (attempt < attempts) {
    attempt += 1;
    try {
      return await task();
    } catch (error) {
      lastError = error;
      const canRetry = attempt < attempts && shouldRetry(error);
      if (!canRetry) {
        throw error;
      }

      const exponentialDelay = baseDelayMs * Math.pow(backoffMultiplier, attempt - 1);
      const delayMs = Math.min(maxDelayMs, Math.max(0, exponentialDelay));
      onRetry(error, attempt, delayMs);
      await sleep(delayMs);
    }
  }

  throw lastError;
}

module.exports = { withRetry };
