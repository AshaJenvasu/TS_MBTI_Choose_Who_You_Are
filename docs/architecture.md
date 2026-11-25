flowchart LR

subgraph 0["src"]
1["app.test.ts"]
6["app.ts"]
subgraph B["assessment"]
subgraph C["controllers"]
D["get-result.controllers.ts"]
16["submit-test.controllers.ts"]
1Q["get-result.controllers.test.ts"]
1R["submit-test.controllers.test.ts"]
end
subgraph T["schema"]
U["get-result.schema.ts"]
17["submit-test.schema.ts"]
end
subgraph V["services"]
W["get-result.services.ts"]
18["question-bank.ts"]
19["submit-test.services.ts"]
1B["scoring.ts"]
1V["question-bank.test.ts"]
1W["scoring.test.ts"]
end
subgraph X["repositories"]
Y["get-result.repository.ts"]
10["schema.ts"]
1A["submit-test.repository.ts"]
1S["reference-data.test.ts"]
1T["seed-data.ts"]
1U["seed.ts"]
end
end
subgraph E["db"]
F["client.ts"]
1X["generate-erd.ts"]
end
M["errors.ts"]
subgraph 13["identity"]
subgraph 14["repositories"]
15["schema.ts"]
end
1C["auth.ts"]
subgraph 1J["controllers"]
1K["me.controllers.ts"]
2D["me.controllers.test.ts"]
end
subgraph 1L["middleware"]
1M["require-auth.ts"]
end
subgraph 1O["schema"]
1P["me.schema.ts"]
end
subgraph 28["dev"]
29["auth-test-page.ts"]
end
2A["auth.test.ts"]
subgraph 2B["testing"]
2C["fake-google.ts"]
end
end
23["dev.ts"]
end
subgraph 2["node_modules"]
subgraph 3["vitest"]
subgraph 4["dist"]
5["index.js"]
end
end
subgraph 7["@hono"]
subgraph 8["zod-openapi"]
subgraph 9["dist"]
A["index.cjs"]
end
end
end
subgraph G["drizzle-orm"]
subgraph H["node-postgres"]
I["index.js"]
end
Z["index.cjs"]
subgraph 11["pg-core"]
12["index.js"]
end
end
subgraph J["pg"]
subgraph K["lib"]
L["index.js"]
end
end
subgraph N["hono"]
subgraph O["dist"]
subgraph P["cjs"]
Q["index.js"]
end
end
end
subgraph 1D["better-auth"]
subgraph 1E["dist"]
1F["index.mjs"]
end
end
subgraph 1Z["drizzle-dbml-generator"]
subgraph 20["dist"]
21["index.cjs"]
end
end
subgraph 24["@scalar"]
subgraph 25["hono-api-reference"]
subgraph 26["dist"]
27["index.js"]
end
end
end
end
subgraph R["hono"]
S["http-exception"]
1N["factory"]
end
subgraph 1G["better-auth"]
subgraph 1H["adapters"]
1I["drizzle"]
end
end
1Y["child_process"]
22["url"]
1-->6
1-->18
1-->F
1-->5
6-->D
6-->16
6-->F
6-->M
6-->1C
6-->1K
6-->A
D-->F
D-->M
D-->U
D-->W
D-->A
F-->I
F-->L
M-->A
M-->Q
M-->S
U-->A
W-->F
W-->Y
Y-->F
Y-->10
Y-->Z
10-->15
10-->Z
10-->12
15-->Z
15-->12
16-->F
16-->M
16-->17
16-->19
16-->A
16-->S
17-->18
17-->A
19-->F
19-->1A
19-->1B
1A-->F
1A-->10
1A-->Z
1B-->18
1C-->F
1C-->15
1C-->1F
1C-->1I
1K-->M
1K-->1C
1K-->1M
1K-->1P
1K-->A
1M-->1C
1M-->1N
1P-->1M
1P-->A
1Q-->6
1Q-->F
1Q-->18
1Q-->L
1Q-->5
1R-->6
1R-->F
1R-->18
1R-->L
1R-->5
1S-->L
1S-->5
1U-->10
1U-->1T
1U-->I
1U-->L
1V-->18
1V-->5
1W-->18
1W-->1B
1W-->5
1X-->10
1X-->15
1X-->1Y
1X-->21
1X-->22
23-->6
23-->F
23-->1C
23-->29
23-->27
2A-->6
2A-->F
2A-->1C
2A-->2C
2A-->L
2A-->5
2C-->1C
2C-->5
2D-->6
2D-->F
2D-->1C
2D-->1M
2D-->2C
2D-->Q
2D-->L
2D-->5
