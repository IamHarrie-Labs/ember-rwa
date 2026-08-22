const crypto = require("node:crypto");
const Anthropic = require("@anthropic-ai/sdk");
require("dotenv").config();

// Underwriting is reproducible rather than attested-by-hardware, and honest about which
// it is: every call records the exact model, prompt, and schema alongside a hash of the
// output, so a third party can re-run it and compare rather than take our word.
const MODEL = process.env.UNDERWRITER_MODEL || "claude-opus-5";
const MAX_TOKENS = 16000;

const sha256 = (s) => "0x" + crypto.createHash("sha256").update(s).digest("hex");

function available() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/// One structured judgment call. Returns the parsed output plus everything needed to
/// reproduce it.
async function judge({ system, prompt, schema, effort = "high" }) {
  const client = new Anthropic();

  // `effort` is rejected outright by Haiku 4.5, which is the obvious model to iterate on
  // when the budget is small. Structured outputs work everywhere we care about; effort does
  // not, so it is only sent where it is supported.
  const supportsEffort = !/haiku/i.test(MODEL);

  const request = {
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system,
    output_config: {
      ...(supportsEffort ? { effort } : {}),
      format: { type: "json_schema", schema },
    },
    messages: [{ role: "user", content: prompt }],
  };

  const response = await client.messages.create(request);

  if (response.stop_reason === "refusal") {
    throw new Error(`model declined: ${response.stop_details?.category || "unspecified"}`);
  }

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");

  let output;
  try {
    output = JSON.parse(text);
  } catch (e) {
    throw new Error(`model returned unparseable output: ${e.message}`);
  }

  return {
    output,
    provenance: {
      model: MODEL,
      // Record what was actually sent, so a reader re-running this reproduces the request.
      effort: supportsEffort ? effort : null,
      systemHash: sha256(system),
      promptHash: sha256(prompt),
      schemaHash: sha256(JSON.stringify(schema)),
      outputHash: sha256(text),
      stopReason: response.stop_reason,
      usage: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
      },
    },
  };
}

module.exports = { judge, available, sha256, MODEL };
