export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const required = ['RABBITMQ_URL', 'DATABASE_URL', 'KAFKA_BROKERS'];
  const missing = required.filter((key) => !config[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return config;
}
