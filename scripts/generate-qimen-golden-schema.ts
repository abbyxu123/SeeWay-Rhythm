import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { QimenGoldenFixtureSchema } from "@seeway/qimen-core";
import { z } from "zod";

const destination = resolve(
  process.cwd(),
  "tests/fixtures/qimen-golden/cases.schema.json",
);
const schema = z.toJSONSchema(QimenGoldenFixtureSchema);

writeFileSync(destination, `${JSON.stringify(schema, null, 2)}\n`, "utf8");
