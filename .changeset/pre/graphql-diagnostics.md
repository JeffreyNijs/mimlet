---
'@mimlet/graphql': patch
---

Clearer preparation errors. A schema with a custom scalar but no `scalars` entry now
names each missing scalar, and invalid or misplaced scalar hooks name the scalar too.
Schema and operation validation failures, such as an unknown field or an
introspection query, keep GraphQL's message in `issues` (bounded to 300 characters)
and repeat the first one in the error message, instead of only a location. Variable
and response issues are unchanged and still never echo fixture values.
