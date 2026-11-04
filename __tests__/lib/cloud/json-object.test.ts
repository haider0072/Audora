/**
 * @jest-environment node
 */
import { JsonConflictError, readJson, updateJson } from "@/lib/cloud/json-object"
import { R2Client } from "@/lib/cloud/r2"
import { installFakeR2, type FakeR2 } from "@/testing/fake-r2"

const client = new R2Client({
  accountId: "acct",
  accessKeyId: "key",
  secretAccessKey: "secret",
  bucket: "bucket",
  password: "x".repeat(12),
  sessionSecret: "s".repeat(32),
})

const parseCount = (raw: unknown) =>
  typeof raw === "object" && raw !== null && typeof (raw as { n?: unknown }).n === "number"
    ? (raw as { n: number })
    : { n: 0 }

describe("JSON documents in the bucket", () => {
  let r2: FakeR2
  beforeEach(() => {
    r2 = installFakeR2()
  })
  afterEach(() => r2.restore())

  it("creates a missing document only if it is still missing", async () => {
    await updateJson(client, "doc.json", parseCount, (doc) => ({ n: doc.n + 1 }))
    expect((await readJson(client, "doc.json", parseCount)).value).toEqual({ n: 1 })
  })

  it("re-reads and re-applies the change when another writer got there first", async () => {
    await updateJson(client, "doc.json", parseCount, () => ({ n: 5 }))
    r2.conflictNextPuts(2)
    const result = await updateJson(client, "doc.json", parseCount, (doc) => ({ n: doc.n + 1 }))
    expect(result).toEqual({ n: 6 })
  })

  it("gives up after repeated conflicts instead of clobbering", async () => {
    r2.conflictNextPuts(10)
    await expect(updateJson(client, "doc.json", parseCount, () => ({ n: 1 }))).rejects.toThrow(JsonConflictError)
  })

  it("skips the write when the change has nothing to do", async () => {
    await updateJson(client, "doc.json", parseCount, () => null)
    expect(r2.requests.filter((request) => request.startsWith("PUT"))).toHaveLength(0)
  })

  it("treats a corrupt document as a fresh one", async () => {
    r2.put("doc.json", "{not json")
    jest.spyOn(console, "error").mockImplementation(() => {})
    expect((await readJson(client, "doc.json", parseCount)).value).toEqual({ n: 0 })
  })
})
