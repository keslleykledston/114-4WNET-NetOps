#!/usr/bin/env node
import { runBgpAnnouncementSuite } from "./bgp-announcement-selftest-lib.mjs";
runBgpAnnouncementSuite("upstream-audit-local-as");
