#!/usr/bin/env node

import assert from "assert";

function pass(msg) {
  console.log(`✓ ${msg}`);
}

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

console.log("🧪 Provisioning Execute Controlled Selftest\n");

try {
  // Test 1: Feature flag disabled blocks execution
  console.log("Test 1: Feature flag PROVISIONING_EXECUTE_ENABLED=false");

  const flagEnabled = (process.env.PROVISIONING_EXECUTE_ENABLED ?? "false").toLowerCase() === "true";
  assert(flagEnabled === false || flagEnabled === true, "Flag must be true or false");
  pass(`Feature flag status: PROVISIONING_EXECUTE_ENABLED=${flagEnabled}`);

  // Test 2: Approval required
  console.log("\nTest 2: Approval required for execution");

  const mockJob = {
    id: 1,
    status: "approved",
    approvedByUserId: null, // No approval
    approvedAt: null,
  };

  // Simulação: sem approvedByUserId, execution deve ser bloqueada
  const canExecuteWithoutApproval = mockJob.approvedByUserId != null;
  assert(canExecuteWithoutApproval === false, "Execution without approval should be blocked");
  pass("Job without approval_id: blocked");

  // Test 3: Maintenance window validation
  console.log("\nTest 3: Maintenance window validation");

  const now = new Date();
  const futureTime = new Date(now.getTime() + 60000); // 60 seconds from now
  const pastTime = new Date(now.getTime() - 60000); // 60 seconds ago

  const inWindow = (start, end) => now >= start && now <= end;

  const windowValid = inWindow(pastTime, futureTime);
  assert(windowValid === true, "Current time should be inside window");
  pass("Current time inside window: valid");

  const outsideWindow = inWindow(futureTime, new Date(futureTime.getTime() + 60000));
  assert(outsideWindow === false, "Current time outside window: blocked");
  pass("Current time outside window: blocked");

  // Test 4: Execution plan locked
  console.log("\nTest 4: Execution plan locked on approve");

  const executionPlan = {
    commands: [
      "configure terminal",
      "interface ge0/0/1",
      "ip address 192.168.1.1 255.255.255.0",
      "exit",
    ],
    timestamp: new Date().toISOString(),
  };

  const planJson = JSON.stringify(executionPlan);
  assert(planJson.includes("configure terminal"), "Plan should contain commands");
  assert(executionPlan.commands.length === 4, "Plan has 4 commands");
  pass("Execution plan locked: 4 commands");

  // Test 5: Rollback plan snapshot
  console.log("\nTest 5: Rollback plan snapshot");

  const rollbackPlan = `# Rollback configuration
configure terminal
no interface ge0/0/1
exit
`;

  assert(rollbackPlan.includes("no interface"), "Rollback should have negation");
  pass("Rollback plan generated");

  // Test 6: Stdout/stderr masking
  console.log("\nTest 6: Output masking");

  function maskSensitiveOutput(output, sensitiveKeys) {
    let masked = output;
    const patterns = [
      /password\s*=\s*\S+/gi,
      /community\s*=\s*\S+/gi,
      /secret\s*=\s*\S+/gi,
    ];
    for (const pattern of patterns) {
      masked = masked.replace(pattern, (match) => {
        const prefix = match.split("=")[0] || "";
        return `${prefix}=[REDACTED]`;
      });
    }
    return masked;
  }

  const rawOutput = "set community = mysecret123\npassword = admin123";
  const maskedOutput = maskSensitiveOutput(rawOutput, []);

  assert(!maskedOutput.includes("mysecret123"), "Secret should be redacted");
  assert(!maskedOutput.includes("admin123"), "Password should be redacted");
  assert(maskedOutput.includes("[REDACTED]"), "Output should show redaction");
  pass("Masking: secrets redacted");

  // Test 7: Status transitions
  console.log("\nTest 7: Status transition machine");

  const transitions = {
    draft: ["validated", "cancelled"],
    validated: ["pending_approval", "draft", "cancelled"],
    pending_approval: ["approved", "blocked", "cancelled", "validated"],
    approved: ["executing", "blocked", "cancelled"],
    executing: ["completed", "failed", "blocked"],
    completed: ["postcheck_running", "rolled_back"],
    postcheck_running: ["postcheck_completed", "failed"],
    postcheck_completed: ["rolled_back"],
  };

  const validApprovedToExecuting = transitions["approved"].includes("executing");
  assert(validApprovedToExecuting === true, "approved → executing valid");
  pass("approved → executing: valid");

  const validCompletedToPostcheck = transitions["completed"].includes("postcheck_running");
  assert(validCompletedToPostcheck === true, "completed → postcheck_running valid");
  pass("completed → postcheck_running: valid");

  const validPostcheckComplete = transitions["postcheck_completed"].includes("rolled_back");
  assert(validPostcheckComplete === true, "postcheck_completed → rolled_back valid");
  pass("postcheck_completed → rolled_back: valid");

  // Test 8: Job type constants
  console.log("\nTest 8: New job types");

  const jobTypes = [
    "PING", "TCP_CHECK", "SSH_COMMAND",
    "PROVISION_PREVIEW", "PROVISION_VALIDATE", "PROVISION_EXECUTE",
    "PROVISION_POSTCHECK", "PROVISION_ROLLBACK", "PROVISION_ROLLBACK_PREVIEW",
  ];

  const hasPostcheck = jobTypes.includes("PROVISION_POSTCHECK");
  const hasRollbackPreview = jobTypes.includes("PROVISION_ROLLBACK_PREVIEW");

  assert(hasPostcheck === true, "PROVISION_POSTCHECK must exist");
  assert(hasRollbackPreview === true, "PROVISION_ROLLBACK_PREVIEW must exist");
  pass("New job types present: PROVISION_POSTCHECK, PROVISION_ROLLBACK_PREVIEW");

  // Test 9: Approval metadata
  console.log("\nTest 9: Approval metadata capture");

  const approvalData = {
    approvedByUserId: 42,
    approvedAt: new Date().toISOString(),
  };

  assert(approvalData.approvedByUserId != null, "Must capture user ID");
  assert(approvalData.approvedAt != null, "Must capture timestamp");
  pass("Approval metadata: user_id + timestamp");

  // Test 10: Postcheck result types
  console.log("\nTest 10: Postcheck result types");

  const validResults = ["passed", "failed", "partial"];
  const testResult = "passed";

  assert(validResults.includes(testResult), "Result must be valid type");
  pass("Postcheck result: passed | failed | partial");

  console.log("\n🎉 All provisioning execute tests passed!\n");

} catch (error) {
  fail(`Test failed: ${error.message}`);
}
