import { readFileSync, writeFileSync } from "node:fs";

const [, , templatePath, outputPath] = process.argv;

if (!templatePath || !outputPath) {
  console.error(
    "Usage: node scripts/aws/render-ecs-task-definition.mjs <template> <output>",
  );
  process.exit(1);
}

const replacements = {
  __IMAGE__: process.env.IMAGE_URI,
  __TASK_FAMILY__: process.env.TASK_FAMILY,
  __CONTAINER_NAME__: process.env.CONTAINER_NAME,
  __AWS_REGION__: process.env.AWS_REGION,
  __LOG_GROUP__: process.env.LOG_GROUP,
  __EXECUTION_ROLE_ARN__: process.env.EXECUTION_ROLE_ARN,
  __TASK_ROLE_ARN__: process.env.TASK_ROLE_ARN,
  __DATABASE_URL_SECRET_ARN__: process.env.DATABASE_URL_SECRET_ARN,
  __DIRECT_URL_SECRET_ARN__: process.env.DIRECT_URL_SECRET_ARN,
  __CLERK_SECRET_KEY_SECRET_ARN__: process.env.CLERK_SECRET_KEY_SECRET_ARN,
  __UPLOADTHING_TOKEN_SECRET_ARN__: process.env.UPLOADTHING_TOKEN_SECRET_ARN,
  __NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY__:
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
  __NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL__:
    process.env.NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL,
  __NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL__:
    process.env.NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL,
};

const missingEntries = Object.entries(replacements)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missingEntries.length > 0) {
  console.error(
    `Missing required task-definition values: ${missingEntries.join(", ")}`,
  );
  process.exit(1);
}

const rendered = Object.entries(replacements).reduce(
  (contents, [placeholder, value]) => contents.replaceAll(placeholder, value),
  readFileSync(templatePath, "utf8"),
);

writeFileSync(outputPath, rendered);
