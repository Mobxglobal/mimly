import path from "node:path";

const QA_DIR = path.join(process.cwd(), "qa");

export function qaTemplateBucketsPath() {
  return path.join(QA_DIR, "template-buckets.json");
}

export function qaBucketConfigsPath() {
  return path.join(QA_DIR, "bucket-configs.json");
}

export function qaRealOutputCachePath() {
  return path.join(QA_DIR, "real-output-cache.json");
}
