---
'@mimlet/codegen': patch
---

`mimlet doctor` warns when a native library is newer than the versions an adapter was
tested with. The new `PEER_VERSION_UNTESTED` warning covers a version inside the
adapter's supported peer range but outside its tested range, read from the adapter's
`mimlet.testedPeers` field. A warning keeps the report `ok` and the exit code 0; the
hint says newer versions usually work, where to report a problem, and which range to
pin for a tested setup. A version outside the supported range is still the error
`PEER_VERSION_UNSUPPORTED`. Each `packages[].peers` entry now also lists `tested` when
the package declares it.
