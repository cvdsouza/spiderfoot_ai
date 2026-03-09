// ════════════════════════════════════════════════════════════════════════════
// NEXUS PLATFORM — AI Security Products Suite
// Products: WATCHPOST (SOC) · DISSECT (Malware Analysis)
// ════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useRef, useCallback } from "react";

// ─── SHARED: API CALL ─────────────────────────────────────────────────────────
async function callAgent(systemPrompt, userMessage) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.content?.[0]?.text || "";
}

// ─── SHARED: MARKDOWN RENDERER ────────────────────────────────────────────────
function MD({ text, accent = "#00B4FF" }) {
  if (!text) return null;
  const lines = text.split("\n");
  const els = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("## ")) {
      els.push(
        <div key={i} style={{ fontSize: "9px", fontWeight: "700", letterSpacing: "0.18em", color: accent, borderBottom: `1px solid ${accent}25`, paddingBottom: "5px", marginTop: "14px", marginBottom: "8px", fontFamily: "inherit" }}>
          {line.slice(3).toUpperCase()}
        </div>
      );
    } else if (line.startsWith("| ")) {
      const rows = [];
      while (i < lines.length && lines[i].startsWith("|")) { rows.push(lines[i]); i++; }
      const dataRows = rows.filter(r => !r.match(/^\|[\s\-|]+\|$/));
      els.push(
        <div key={i} style={{ overflowX: "auto", margin: "6px 0" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px" }}>
            {dataRows.map((row, ri) => {
              const cells = row.split("|").filter(c => c.trim());
              return (
                <tr key={ri} style={{ borderBottom: "1px solid #18181B" }}>
                  {cells.map((cell, ci) => {
                    const c = cell.trim();
                    const col = /CRITICAL|MALICIOUS|INFECTED|HIGH RISK/.test(c) ? "#FF3B30"
                      : /HIGH|SUSPICIOUS|PACKED/.test(c) ? "#FF9F0A"
                      : /MEDIUM|UNKNOWN/.test(c) ? "#FFD60A"
                      : /LOW|CLEAN|BENIGN/.test(c) ? "#32D74B"
                      : /✅|YES|CONFIRMED/.test(c) ? "#32D74B"
                      : /❌|NO|NONE/.test(c) ? "#FF3B30"
                      : ri === 0 ? "#52525B" : "#D4D4D8";
                    return (
                      <td key={ci} style={{ padding: "4px 8px", color: col, fontSize: ri === 0 ? "8px" : "10px", fontWeight: ri === 0 ? "700" : "400", letterSpacing: ri === 0 ? "0.08em" : "0", textAlign: "left" }}>
                        {c}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </table>
        </div>
      );
      continue;
    } else if (line.startsWith("- [")) {
      const done = /\[✅\]|\[x\]|\[X\]/.test(line);
      const content = line.replace(/^- \[.*?\] /, "");
      els.push(
        <div key={i} style={{ display: "flex", gap: "8px", alignItems: "flex-start", marginBottom: "4px", fontSize: "10px" }}>
          <span style={{ color: done ? "#32D74B" : "#3F3F46", minWidth: "12px" }}>{done ? "✓" : "○"}</span>
          <span style={{ color: done ? "#32D74B" : "#D4D4D8" }}>{content}</span>
        </div>
      );
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      const c = line.slice(2);
      const p = c.split(/(\*\*[^*]+\*\*)/).map((x, pi) =>
        x.startsWith("**") ? <strong key={pi} style={{ color: "#F4F4F5" }}>{x.replace(/\*\*/g, "")}</strong> : x
      );
      els.push(
        <div key={i} style={{ display: "flex", gap: "8px", marginBottom: "3px", fontSize: "10px", color: "#71717A" }}>
          <span style={{ color: accent, minWidth: "8px" }}>›</span>
          <span>{p}</span>
        </div>
      );
    } else if (line.match(/^\d+\. /)) {
      const num = line.match(/^\d+/)[0];
      const c = line.slice(line.indexOf(" ") + 1).split(/(\*\*[^*]+\*\*)/).map((x, pi) =>
        x.startsWith("**") ? <strong key={pi} style={{ color: "#F4F4F5" }}>{x.replace(/\*\*/g, "")}</strong> : x
      );
      els.push(
        <div key={i} style={{ display: "flex", gap: "8px", marginBottom: "3px", fontSize: "10px", color: "#71717A" }}>
          <span style={{ color: accent, minWidth: "14px", fontWeight: "700" }}>{num}.</span>
          <span>{c}</span>
        </div>
      );
    } else if (line.startsWith("> **")) {
      els.push(
        <div key={i} style={{ marginTop: "10px", paddingTop: "8px", borderTop: "1px solid #27272A", fontSize: "8px", color: "#3F3F46", letterSpacing: "0.05em" }}>
          {line.slice(2)}
        </div>
      );
    } else if (line.startsWith("**") && line.endsWith("**") && !line.slice(2, -2).includes("**")) {
      els.push(<div key={i} style={{ fontSize: "10px", color: "#F4F4F5", fontWeight: "700", marginBottom: "3px" }}>{line.replace(/\*\*/g, "")}</div>);
    } else if (line.trim()) {
      const p = line.split(/(\*\*[^*]+\*\*)/).map((x, pi) =>
        x.startsWith("**") ? <strong key={pi} style={{ color: "#E4E4E7", fontWeight: "600" }}>{x.replace(/\*\*/g, "")}</strong> : x
      );
      els.push(<p key={i} style={{ fontSize: "10px", color: "#71717A", marginBottom: "4px", lineHeight: "1.6" }}>{p}</p>);
    } else {
      els.push(<div key={i} style={{ height: "4px" }} />);
    }
    i++;
  }
  return <div>{els}</div>;
}

// ════════════════════════════════════════════════════════════════════════════
// PRODUCT 1: WATCHPOST — Security Operations Center
// ════════════════════════════════════════════════════════════════════════════

const WP_SEV = {
  CRITICAL: { color: "#FF3B30", bg: "#280A08" },
  HIGH:     { color: "#FF9F0A", bg: "#271500" },
  MEDIUM:   { color: "#FFD60A", bg: "#1F1B00" },
  LOW:      { color: "#48484A", bg: "#111418" },
};

const WP_STAGES = [
  { id: "intake",      label: "INTAKE",      icon: "⬡", color: "#48484A", agentId: null },
  { id: "triage",      label: "TRIAGE",      icon: "◈", color: "#00B4FF", agentId: "sentinel" },
  { id: "investigate", label: "INVESTIGATE", icon: "⊕", color: "#BF5AF2", agentId: "hunter" },
  { id: "analyze",     label: "ANALYZE",     icon: "◎", color: "#FFD60A", agentId: "analyst" },
  { id: "respond",     label: "RESPOND",     icon: "⊛", color: "#FF9F0A", agentId: "responder" },
  { id: "escalate",    label: "ESCALATE",    icon: "▲", color: "#FF453A", agentId: "escalator" },
  { id: "resolve",     label: "RESOLVE",     icon: "✦", color: "#32D74B", agentId: "resolver" },
  { id: "closed",      label: "CLOSED",      icon: "■", color: "#1C7C34", agentId: null },
];
const WP_STAGE_IDS = WP_STAGES.map(s => s.id);

const WP_AGENTS = {
  sentinel:  { id: "sentinel",  name: "SENTINEL",  emoji: "◈", role: "Alert Triage",       color: "#00B4FF", bg: "#001828",
    sys: `You are SENTINEL, AI triage agent in WATCHPOST SOC. Analyze alerts and produce structured triage.
Format your response EXACTLY as:
## TRIAGE REPORT
**Alert Classification:** [Threat Category]
**Severity Score:** [1-10] — [CRITICAL/HIGH/MEDIUM/LOW]
**Confidence:** [LOW/MEDIUM/HIGH] — true positive likelihood
## Verdict
[TRUE POSITIVE / FALSE POSITIVE / NEEDS INVESTIGATION] — one sentence rationale
## Initial IOCs
| Indicator | Type | Reputation |
|-----------|------|------------|
[2-4 rows]
## Priority Actions
- [ ] [Action 1]
- [ ] [Action 2]
- [ ] [Action 3]
## Triage Notes
[2-3 sentences]
> **SENTINEL** · Triage · ${new Date().toISOString()}` },

  hunter:    { id: "hunter",    name: "HUNTER",    emoji: "⊕", role: "Threat Investigation", color: "#BF5AF2", bg: "#180A28",
    sys: `You are HUNTER, AI threat investigation agent in WATCHPOST SOC.
Format your response EXACTLY as:
## INVESTIGATION REPORT
## Attack Timeline
| Time | Event | Host/IP | User |
|------|-------|---------|------|
[3-5 rows]
## Attack Vector Analysis
**Initial Access:** [method]
**Techniques Observed:** [TTPs]
**Lateral Movement:** [Yes/No + details]
**Persistence Mechanisms:** [detected/suspected]
## Correlated Events
[2-3 bullet points]
## Threat Intelligence
**Known Campaign:** [Yes/No]
**CVE References:** [CVEs or N/A]
## Scope Assessment
**Affected Assets:** [list]
**Blast Radius:** [Contained/Limited/Widespread]
**Data at Risk:** [what could be compromised]
> **HUNTER** · Investigation · ${new Date().toISOString()}` },

  analyst:   { id: "analyst",   name: "ANALYST",   emoji: "◎", role: "Threat Analysis",     color: "#FFD60A", bg: "#1A1500",
    sys: `You are ANALYST, AI threat analysis agent in WATCHPOST SOC. Map to MITRE ATT&CK.
Format your response EXACTLY as:
## THREAT ANALYSIS
## MITRE ATT\&CK Mapping
| Tactic | Technique | ID | Confidence |
|--------|-----------|-----|------------|
[3-5 rows]
## Threat Actor Profile
**Category:** [Nation-State/Cybercriminal/Hacktivist/Insider/Unknown]
**Sophistication:** [Low/Medium/High/Advanced]
**Motivation:** [Financial/Espionage/Disruption/Unknown]
**Attribution Confidence:** [LOW/MEDIUM/HIGH]
## Impact Assessment
**Confidentiality Impact:** [None/Low/Medium/High/Critical]
**Integrity Impact:** [None/Low/Medium/High/Critical]
**Availability Impact:** [None/Low/Medium/High/Critical]
**Business Risk Score:** [1-10]
## Analyst Assessment
[3-4 sentences synthesizing threat narrative]
## Recommended Escalation Level
[None/Tier 2/SOC Manager/CISO/Executive/Law Enforcement]
> **ANALYST** · Analysis · ${new Date().toISOString()}` },

  responder: { id: "responder", name: "RESPONDER", emoji: "⊛", role: "Incident Response",   color: "#FF9F0A", bg: "#1A0E00",
    sys: `You are RESPONDER, AI incident response agent in WATCHPOST SOC.
Format your response EXACTLY as:
## INCIDENT RESPONSE PLAN
## Immediate Containment (Do NOW)
- [ ] [Action 1]
- [ ] [Action 2]
- [ ] [Action 3]
## Eradication Steps
- [ ] [Step 1]
- [ ] [Step 2]
## Recovery Steps
- [ ] [Step 1]
- [ ] [Step 2]
## Evidence Preservation
**Logs to collect:** [sources]
**Artifacts to preserve:** [files/memory/network]
**Chain of custody:** [requirements]
## Communication Plan
**Internal notifications:** [who]
**External notifications:** [regulatory/customers/LEA]
**Timeline:** [within X hours]
## Estimated Response Time
**Containment:** [X hours] · **Eradication:** [X hours/days] · **Full Recovery:** [X days]
> **RESPONDER** · Response · ${new Date().toISOString()}` },

  escalator: { id: "escalator", name: "ESCALATOR", emoji: "▲", role: "Escalation Decision", color: "#FF453A", bg: "#200808",
    sys: `You are ESCALATOR, AI escalation decision agent in WATCHPOST SOC.
Format your response EXACTLY as:
## ESCALATION ASSESSMENT
**Escalate:** [YES/NO]
**Escalation Level:** [Tier 2/SOC Manager/CISO/Executive/Legal/Law Enforcement/Regulatory]
**Urgency:** [IMMEDIATE (<1hr)/URGENT (<4hr)/STANDARD (<24hr)/ROUTINE]
## Escalation Triggers
- [✅/❌] Active breach or ongoing attack
- [✅/❌] Data exfiltration confirmed or suspected
- [✅/❌] Critical infrastructure affected
- [✅/❌] Regulatory reporting required (GDPR/HIPAA/PCI-DSS)
- [✅/❌] Reputational risk
- [✅/❌] Financial impact threshold exceeded
- [✅/❌] Law enforcement required
## Escalation Brief (executive language)
[3-4 sentences, no jargon]
## SLA Status
**Current SLA:** [Within/At Risk/BREACHED] · **Time to breach:** [X hours or N/A]
> **ESCALATOR** · Escalation · ${new Date().toISOString()}` },

  resolver:  { id: "resolver",  name: "RESOLVER",  emoji: "✦", role: "Case Resolution",     color: "#32D74B", bg: "#001A08",
    sys: `You are RESOLVER, AI case closure agent in WATCHPOST SOC.
Format your response EXACTLY as:
## INCIDENT CLOSURE REPORT
## Executive Summary
[3-4 sentences: what happened, impact, how resolved]
## Incident Timeline
**Detected:** [time] · **Triaged:** [time] · **Contained:** [time] · **Resolved:** [time]
**Total MTTR:** [X hours/days]
## Root Cause Analysis
**Root Cause:** [fundamental reason]
**Contributing Factors:** [2-3 factors]
## Actions Taken
[bullet list]
## Lessons Learned
1. [Lesson 1]
2. [Lesson 2]
3. [Lesson 3]
## Preventive Measures
| Recommendation | Priority | Owner | Deadline |
|---------------|----------|-------|----------|
[3-4 rows]
**Final Verdict:** [True Positive/False Positive/Benign True Positive]
**Case Status:** CLOSED ■
> **RESOLVER** · Closure · ${new Date().toISOString()}` },
};

const WP_SAMPLES = [
  { title: "Credential Stuffing — VPN Gateway", severity: "CRITICAL", source: "Palo Alto NGFW", ruleId: "AUTH-BRUTE-9921", host: "vpn.corp.internal", sourceIP: "185.220.101.42", user: "jsmith@corp.com, admin_svc", description: "847 failed authentication attempts in 4 minutes against VPN endpoint vpn.corp.internal from single source IP 185.220.101.42 (known Tor exit node). 3 successful logins detected post-attack for accounts: jsmith@corp.com, admin_svc, backup_user. Attack commenced at 02:14 UTC." },
  { title: "Anomalous S3 Exfiltration — 4.2GB Outbound", severity: "HIGH", source: "AWS CloudTrail + DLP", ruleId: "DLP-EXFIL-4412", host: "prod-db-01 (10.0.1.45)", sourceIP: "10.0.1.45", user: "svc_etl_prod", description: "DLP sensor detected 4.2GB outbound transfer from prod-db-01 to external S3 bucket s3://exfil-staging-2024-tmp not in approved cloud inventory. Transfer by service account svc_etl_prod, outside business hours (23:47–00:10 UTC). No change ticket associated." },
  { title: "Lateral Movement — Pass-the-Hash Detected", severity: "CRITICAL", source: "Microsoft Sentinel / Defender", ruleId: "EDR-LATERAL-0087", host: "DC01, HRAPP01, PAYROLL-DB (+11)", sourceIP: "10.0.0.15", user: "DA-SYS01\\administrator", description: "Domain admin authenticated to 14 unique hosts in 3 minutes via PsExec and WMI. Account inactive for 47 days. NTLM auth without prior Kerberos ticket — pass-the-hash characteristics. EDR flagged process injection on HRAPP01 at 14:32 UTC." },
  { title: "Spear Phishing — Executive CFO Impersonation", severity: "MEDIUM", source: "Email Security Gateway", ruleId: "PHISH-EXEC-7743", host: "Exchange Online / O365", sourceIP: "91.108.4.0/22", user: "r.jones, t.williams, m.park", description: "12 employees received spear-phishing emails impersonating CFO from spoofed domain corp-finance.net. 3 recipients clicked credential harvesting link. 2 successful O365 logins from Telegram infrastructure IP range following clicks. Macro-enabled attachment included." },
];

function buildWPContext(alert) {
  let ctx = `ALERT: ${alert.title}\nSEVERITY: ${alert.severity}\nSOURCE: ${alert.source}\nRULE ID: ${alert.ruleId}\nHOST: ${alert.host}\nSOURCE IP: ${alert.sourceIP}\nUSER: ${alert.user}\n\nDESCRIPTION:\n${alert.description}`;
  if (alert.outputs?.triage)      ctx += `\n\n---\nTRIAGE:\n${alert.outputs.triage}`;
  if (alert.outputs?.investigate) ctx += `\n\n---\nINVESTIGATION:\n${alert.outputs.investigate}`;
  if (alert.outputs?.analyze)     ctx += `\n\n---\nANALYSIS:\n${alert.outputs.analyze}`;
  if (alert.outputs?.respond)     ctx += `\n\n---\nRESPONSE PLAN:\n${alert.outputs.respond}`;
  if (alert.outputs?.escalate)    ctx += `\n\n---\nESCALATION:\n${alert.outputs.escalate}`;
  return ctx;
}

// ════════════════════════════════════════════════════════════════════════════
// PRODUCT 2: DISSECT — Malware Analysis Lab
// ════════════════════════════════════════════════════════════════════════════

const DS_VERDICT = {
  MALICIOUS:   { color: "#FF3B30", bg: "#280A08" },
  SUSPICIOUS:  { color: "#FF9F0A", bg: "#271500" },
  UNKNOWN:     { color: "#FFD60A", bg: "#1F1B00" },
  BENIGN:      { color: "#32D74B", bg: "#00180A" },
};

const DS_STAGES = [
  { id: "intake",      label: "INTAKE",      icon: "⊠",  color: "#48484A", agentId: null },
  { id: "fingerprint", label: "FINGERPRINT", icon: "⊡",  color: "#06B6D4", agentId: "fingerprinter" },
  { id: "static",      label: "STATIC",      icon: "⊞",  color: "#A78BFA", agentId: "dissector" },
  { id: "detonate",    label: "DETONATE",    icon: "⊗",  color: "#F97316", agentId: "detonator" },
  { id: "network",     label: "NETWORK",     icon: "⊛",  color: "#22C55E", agentId: "netwatch" },
  { id: "reverse",     label: "REVERSE",     icon: "⊹",  color: "#EC4899", agentId: "codex" },
  { id: "intel",       label: "THREAT INTEL",icon: "◈",  color: "#EAB308", agentId: "oracle" },
  { id: "report",      label: "REPORT",      icon: "⊶",  color: "#14B8A6", agentId: "scribe" },
  { id: "archived",    label: "ARCHIVED",    icon: "⬛",  color: "#1C3D20", agentId: null },
];
const DS_STAGE_IDS = DS_STAGES.map(s => s.id);

const DS_AGENTS = {
  fingerprinter: { id: "fingerprinter", name: "FINGERPRINTER", emoji: "⊡", role: "Sample Fingerprinting", color: "#06B6D4", bg: "#001820",
    sys: `You are FINGERPRINTER, AI malware sample fingerprinting agent in DISSECT malware analysis lab.
Analyze the submitted sample and produce a fingerprint report.
Format your response EXACTLY as:
## FINGERPRINT REPORT
## Hash Analysis
| Hash Type | Value |
|-----------|-------|
| MD5 | [plausible 32-char hex] |
| SHA1 | [plausible 40-char hex] |
| SHA256 | [plausible 64-char hex] |
| SSDEEP | [fuzzy hash string] |
**VirusTotal Detection Rate:** [X/72 engines]
## File Metadata
**File Type:** [PE32/PE64/ELF/Script/Document/etc.]
**File Size:** [X KB/MB]
**Compile Timestamp:** [date or INVALID/SPOOFED]
**Architecture:** [x86/x64/ARM]
**Entry Point:** [0x address]
## Packer / Obfuscation Detection
**Packer:** [UPX/MPRESS/Custom/None detected]
**Entropy:** [X.XX / 8.0 — HIGH indicates packing]
**Obfuscation:** [None/String Obfuscation/Control Flow Obfuscation/Polymorphic]
## Section Analysis
| Section | Virtual Size | Entropy | Flags |
|---------|--------------|---------|-------|
[3-5 rows: .text, .data, .rdata, suspicious sections]
## Initial Verdict
**Classification:** [MALICIOUS/SUSPICIOUS/UNKNOWN/BENIGN]
**Confidence:** [LOW/MEDIUM/HIGH]
**Rationale:** [one sentence]
> **FINGERPRINTER** · Fingerprint · ${new Date().toISOString()}` },

  dissector: { id: "dissector", name: "DISSECTOR", emoji: "⊞", role: "Static Analysis", color: "#A78BFA", bg: "#160A28",
    sys: `You are DISSECTOR, AI static analysis agent in DISSECT malware analysis lab.
Perform deep static analysis without executing the sample.
Format your response EXACTLY as:
## STATIC ANALYSIS REPORT
## Import Table Analysis
| Library | Suspicious Imports | Risk |
|---------|-------------------|------|
[3-5 rows: DLLs and their concerning imported functions]
## Extracted Strings (Notable)
| String | Category | Significance |
|--------|----------|--------------|
[4-6 rows: IPs, domains, registry keys, commands, etc.]
## Code Signature Matches
| Signature | Malware Family | Confidence |
|-----------|---------------|------------|
[2-4 rows of YARA/AV signature matches]
## Capabilities Identified (Static)
- [ ] [Capability 1: e.g. Keylogging]
- [ ] [Capability 2: e.g. Persistence via registry]
- [ ] [Capability 3: e.g. Anti-VM detection]
- [ ] [Capability 4: e.g. Encrypted communications]
## Static Analysis Summary
[2-3 sentences on key findings]
> **DISSECTOR** · Static Analysis · ${new Date().toISOString()}` },

  detonator: { id: "detonator", name: "DETONATOR", emoji: "⊗", role: "Dynamic / Sandbox Analysis", color: "#F97316", bg: "#1E0A00",
    sys: `You are DETONATOR, AI dynamic behavioral analysis agent in DISSECT malware analysis lab. Simulate sandbox detonation results.
Format your response EXACTLY as:
## DYNAMIC ANALYSIS REPORT
**Sandbox Environment:** Windows 10 x64 / 8GB RAM / Internet: Simulated
**Detonation Duration:** [X seconds]
**Process Chain:** [parent → child → child processes]
## File System Activity
| Operation | Path | Details |
|-----------|------|---------|
[3-5 rows: file drops, modifications, deletions]
## Registry Activity
| Operation | Key/Value | Data |
|-----------|-----------|------|
[2-4 rows: persistence, config writes]
## Process Activity
| PID | Process | Action | Suspicious |
|-----|---------|--------|-----------|
[3-5 rows]
## Network Activity
| Protocol | Destination | Port | Purpose |
|----------|------------|------|---------|
[2-4 rows: C2 beacons, DNS queries, HTTP requests]
## Anti-Analysis Techniques
- [Technique 1: e.g. Sleep calls to evade sandbox timeout]
- [Technique 2: e.g. VM/Debugger detection]
## Behavioral Verdict
**Overall Behavior:** [RANSOMWARE/RAT/DROPPER/INFOSTEALER/BACKDOOR/LOADER/etc.]
**Severity:** [CRITICAL/HIGH/MEDIUM/LOW]
[2-3 sentences behavioral summary]
> **DETONATOR** · Dynamic Analysis · ${new Date().toISOString()}` },

  netwatch: { id: "netwatch", name: "NETWATCH", emoji: "⊛", role: "Network Traffic Analysis", color: "#22C55E", bg: "#001808",
    sys: `You are NETWATCH, AI network traffic analysis agent in DISSECT malware analysis lab.
Format your response EXACTLY as:
## NETWORK TRAFFIC ANALYSIS
## C2 Communication Analysis
| C2 Indicator | Protocol | Frequency | Encoding |
|-------------|----------|-----------|---------|
[2-4 rows]
**Beacon Interval:** [X seconds ± jitter]
**First Contact:** [timestamp]
**Data Exfiltrated:** [size or None detected]
## DNS Analysis
| Domain | Resolves To | Verdict | Registration |
|--------|------------|---------|-------------|
[2-4 rows]
**DGA Detected:** [Yes/No — if yes, describe pattern]
## HTTP/S Traffic
| Method | URL Pattern | User-Agent | Purpose |
|--------|------------|-----------|---------|
[2-3 rows]
## Infrastructure Intelligence
**C2 Provider:** [Hosting provider / bulletproof host]
**Geo-location:** [Country/ASN]
**Related Infrastructure:** [other domains/IPs on same infrastructure]
**Takedown Status:** [Active/Sinkholed/Offline]
## Network IOCs
[Bullet list of confirmed network indicators]
> **NETWATCH** · Network Analysis · ${new Date().toISOString()}` },

  codex: { id: "codex", name: "CODEX", emoji: "⊹", role: "Reverse Engineering", color: "#EC4899", bg: "#1E0814",
    sys: `You are CODEX, AI reverse engineering agent in DISSECT malware analysis lab. Analyze disassembled code.
Format your response EXACTLY as:
## REVERSE ENGINEERING REPORT
## Key Function Analysis
| Function | Address | Purpose | Complexity |
|---------|---------|---------|-----------|
[4-6 rows: identified functions with addresses]
## Obfuscation & Evasion Techniques
| Technique | Description | Severity |
|----------|-------------|---------|
[2-4 rows]
## Cryptographic Analysis
**Encryption:** [Algorithm used: AES-256/RC4/XOR/Custom]
**Key Material:** [hardcoded/derived/C2-provided]
**Encrypted Payload:** [Yes/No — embedded encrypted blob detected]
## Code Similarity
**Shared Codebase:** [malware family % similarity]
**Compiler:** [MSVC/GCC/Clang/Unknown — version if detectable]
**Developer Artifacts:** [PDB paths / debug strings / language indicators]
## Shellcode Analysis
**Shellcode Present:** [Yes/No]
**Technique:** [process injection type if present]
**Target Process:** [targeted process name if identifiable]
## Reverse Engineering Notes
[3-4 sentences on key code insights and analyst observations]
> **CODEX** · Reverse Engineering · ${new Date().toISOString()}` },

  oracle: { id: "oracle", name: "ORACLE", emoji: "◈", role: "Threat Intelligence", color: "#EAB308", bg: "#1A1200",
    sys: `You are ORACLE, AI threat intelligence agent in DISSECT malware analysis lab.
Format your response EXACTLY as:
## THREAT INTELLIGENCE REPORT
## Malware Classification
**Family:** [specific malware family name]
**Variant/Version:** [version or variant identifier]
**First Seen:** [date — in the wild]
**Last Seen:** [date]
**Prevalence:** [Isolated/Regional/Global]
## Threat Actor Attribution
| Attribute | Details | Confidence |
|-----------|---------|-----------|
| Threat Group | [APT name or criminal group] | [LOW/MED/HIGH] |
| Sponsorship | [Nation-state/Criminal/Hacktivist] | [LOW/MED/HIGH] |
| Origin | [Country/Region] | [LOW/MED/HIGH] |
| Campaign | [Campaign name if known] | [LOW/MED/HIGH] |
## MITRE ATT\&CK for ICS/Enterprise
| Tactic | Technique | ID |
|--------|-----------|-----|
[4-6 rows]
## Related Samples & Campaigns
[2-3 bullet points linking to known campaigns or related malware]
## Intelligence Summary
[3-4 sentences on threat landscape context and risk to organization]
## Recommended Actions
| Action | Priority | Rationale |
|--------|---------|-----------|
[3-4 rows]
> **ORACLE** · Threat Intelligence · ${new Date().toISOString()}` },

  scribe: { id: "scribe", name: "SCRIBE", emoji: "⊶", role: "Analysis Report", color: "#14B8A6", bg: "#001816",
    sys: `You are SCRIBE, AI report generation agent in DISSECT malware analysis lab. Compile the complete malware analysis report.
Format your response EXACTLY as:
## MALWARE ANALYSIS REPORT
## Executive Summary
[4-5 sentences: what the malware is, what it does, severity, impact, recommended action]
## Final Classification
**Malware Family:** [name]
**Type:** [Ransomware/RAT/Infostealer/Dropper/Loader/Wiper/etc.]
**Final Verdict:** [MALICIOUS/SUSPICIOUS/BENIGN]
**Severity:** [CRITICAL/HIGH/MEDIUM/LOW]
**Confidence:** [LOW/MEDIUM/HIGH]
## Complete IOC List
| Indicator | Type | Confidence |
|-----------|------|-----------|
[6-10 rows: hashes, IPs, domains, registry keys, file paths]
## Detection Recommendations
| Control | Detection Rule/Signature | Priority |
|---------|------------------------|---------|
[3-5 rows: SIEM rules, EDR signatures, FW blocks, email filters]
## Remediation Checklist
- [ ] [Step 1]
- [ ] [Step 2]
- [ ] [Step 3]
- [ ] [Step 4]
- [ ] [Step 5]
## Analysis Metadata
**Total Analysis Time:** [X minutes]
**Analyst:** DISSECT AI Lab — All Agents
**Report Status:** FINAL ■
> **SCRIBE** · Report · ${new Date().toISOString()}` },
};

const DS_SAMPLES = [
  { title: "Emotet Dropper — Word Document Macro", verdict: "MALICIOUS", fileType: "DOCX", fileHash: "a3f9e12c8b4d...", source: "Email Quarantine", description: "Macro-enabled Word document submitted from email quarantine. Subject: 'Invoice_March_2026.docm'. Sent to finance@corp.com from spoofed vendor address. Document contains obfuscated VBA macro that, when enabled, downloads and executes a secondary payload from a remote URL. 3 employees opened the attachment before quarantine triggered." },
  { title: "Cobalt Strike Beacon — Memory Injection", verdict: "MALICIOUS", fileType: "PE64", fileHash: "7e2d4a91c03f...", source: "EDR Memory Dump", description: "EDR agent captured memory dump from HRAPP01 after detecting anomalous process hollowing. Injected shellcode identified in explorer.exe (PID 4821). Beacon callback to 185.234.219.41:443 observed. Network traffic shows SSL/TLS with self-signed cert, non-standard JA3 fingerprint consistent with CS team server." },
  { title: "LockBit 3.0 Ransomware — Pre-Execution", verdict: "MALICIOUS", fileType: "PE32+", fileHash: "d4c8b2e7a519...", source: "Endpoint Detection (blocked)", description: "EDR blocked execution of suspicious PE on FILESVR02 before detonation. Binary exhibits ransomware characteristics: file enumeration behavior, shadow copy deletion commands, wallpaper modification. Filename: 'update_service.exe' in %APPDATA%\\Microsoft\\. Creation date matches lateral movement window from prior incident." },
  { title: "Unknown Script — Possible Infostealer", verdict: "SUSPICIOUS", fileType: "PS1", fileHash: "9b3c1f72e840...", source: "Threat Hunt (manual upload)", description: "PowerShell script discovered during threat hunting on DEV-BUILD-03. Script performs credential harvesting from browser stores (Chrome, Firefox, Edge), Discord token theft, and clipboard monitoring. Obfuscated with base64 encoding and string concatenation. Attempts to exfiltrate data via Telegram Bot API to token: bot5882910274:AAH..." },
];

function buildDSContext(sample) {
  let ctx = `SAMPLE: ${sample.title}\nVERDICT CONTEXT: ${sample.verdict}\nFILE TYPE: ${sample.fileType}\nFILE HASH: ${sample.fileHash}\nSOURCE: ${sample.source}\n\nDESCRIPTION:\n${sample.description}`;
  if (sample.outputs?.fingerprint) ctx += `\n\n---\nFINGERPRINT:\n${sample.outputs.fingerprint}`;
  if (sample.outputs?.static)      ctx += `\n\n---\nSTATIC ANALYSIS:\n${sample.outputs.static}`;
  if (sample.outputs?.detonate)    ctx += `\n\n---\nDYNAMIC ANALYSIS:\n${sample.outputs.detonate}`;
  if (sample.outputs?.network)     ctx += `\n\n---\nNETWORK ANALYSIS:\n${sample.outputs.network}`;
  if (sample.outputs?.reverse)     ctx += `\n\n---\nREVERSE ENGINEERING:\n${sample.outputs.reverse}`;
  if (sample.outputs?.intel)       ctx += `\n\n---\nTHREATINTEL:\n${sample.outputs.intel}`;
  return ctx;
}

// ════════════════════════════════════════════════════════════════════════════
// SHARED KANBAN ENGINE
// ════════════════════════════════════════════════════════════════════════════

function useKanban(initialItems, stageIds, stages, agentMap, contextBuilder) {
  const [items, setItems] = useState(
    initialItems.map((item, i) => ({
      ...item, id: i + 1, stage: stageIds[0], outputs: {},
      createdAt: new Date(Date.now() - (initialItems.length - i) * 8 * 60000).toISOString(),
    }))
  );
  const [running, setRunning] = useState(new Set());
  const counter = useRef(initialItems.length + 1);

  const addItem = useCallback((item) => {
    const newItem = { ...item, id: counter.current++, stage: stageIds[0], outputs: {}, createdAt: new Date().toISOString() };
    setItems(prev => [newItem, ...prev]);
    return newItem.id;
  }, [stageIds]);

  const runStep = useCallback(async (itemId) => {
    const item = items.find(x => x.id === itemId);
    if (!item || running.has(itemId)) return;
    const idx = stageIds.indexOf(item.stage);
    const stageObj = stages[idx];
    if (!stageObj) return;
    if (!stageObj.agentId) {
      if (idx < stageIds.length - 1) setItems(prev => prev.map(x => x.id === itemId ? { ...x, stage: stageIds[idx + 1] } : x));
      return;
    }
    const agent = agentMap[stageObj.agentId];
    if (!agent) return;
    setRunning(prev => new Set([...prev, itemId]));
    try {
      const output = await callAgent(agent.sys, contextBuilder(item));
      setItems(prev => prev.map(x => x.id !== itemId ? x : { ...x, stage: stageIds[idx + 1], outputs: { ...x.outputs, [item.stage]: output } }));
    } catch (err) {
      setItems(prev => prev.map(x => x.id !== itemId ? x : { ...x, outputs: { ...x.outputs, [item.stage]: `⚠ AGENT ERROR: ${err.message}` } }));
    } finally {
      setRunning(prev => { const s = new Set(prev); s.delete(itemId); return s; });
    }
  }, [items, running, stageIds, stages, agentMap, contextBuilder]);

  const runAll = useCallback(async (itemId) => {
    let current = items.find(x => x.id === itemId);
    const lastStage = stageIds[stageIds.length - 1];
    if (!current || running.has(itemId)) return;
    while (current && current.stage !== lastStage) {
      const idx = stageIds.indexOf(current.stage);
      const stg = stages[idx];
      if (stg?.agentId) {
        await runStep(itemId);
        await new Promise(r => setTimeout(r, 500));
      } else {
        setItems(prev => prev.map(x => x.id === itemId ? { ...x, stage: stageIds[idx + 1] } : x));
        await new Promise(r => setTimeout(r, 150));
      }
      current = items.find(x => x.id === itemId);
    }
  }, [items, running, stageIds, stages, runStep]);

  return { items, setItems, running, addItem, runStep, runAll };
}

// ════════════════════════════════════════════════════════════════════════════
// PRODUCT SCREENS
// ════════════════════════════════════════════════════════════════════════════

function WatchpostScreen() {
  const { items: alerts, running, addItem, runStep, runAll } = useKanban(WP_SAMPLES, WP_STAGE_IDS, WP_STAGES, WP_AGENTS, buildWPContext);
  const [selected, setSelected] = useState(1);
  const [stageFilter, setStageFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: "", severity: "HIGH", source: "", description: "" });
  const detailRef = useRef(null);

  const filtered = stageFilter === "all" ? alerts : alerts.filter(a => a.stage === stageFilter);
  const sel = alerts.find(a => a.id === selected);
  const stageCounts = Object.fromEntries(WP_STAGE_IDS.map(id => [id, alerts.filter(a => a.stage === id).length]));

  const handleAdd = () => {
    if (!form.title.trim()) return;
    const id = addItem({ ...form, host: "Unknown", sourceIP: "Unknown", user: "Unknown", ruleId: `CUSTOM-${Date.now()}` });
    setSelected(id); setShowAdd(false);
    setForm({ title: "", severity: "HIGH", source: "", description: "" });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", background: "#060A0F" }}>
      {/* Pipeline bar */}
      <div style={{ background: "#060A0F", borderBottom: "1px solid #18181B", padding: "6px 16px", display: "flex", gap: "3px", alignItems: "center", overflowX: "auto", flexShrink: 0 }}>
        <button onClick={() => setStageFilter("all")} style={{ background: stageFilter === "all" ? "#18181B" : "transparent", border: `1px solid ${stageFilter === "all" ? "#3F3F46" : "#27272A"}`, borderRadius: "4px", padding: "4px 10px", color: stageFilter === "all" ? "#F4F4F5" : "#52525B", cursor: "pointer", fontSize: "8px", letterSpacing: "0.1em", whiteSpace: "nowrap", fontFamily: "inherit" }}>ALL · {alerts.length}</button>
        <div style={{ color: "#27272A", padding: "0 4px", fontSize: "10px" }}>|</div>
        {WP_STAGES.map((s, idx) => {
          const active = stageFilter === s.id;
          const cnt = stageCounts[s.id] || 0;
          return (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: "2px" }}>
              {idx > 0 && <div style={{ color: "#27272A", fontSize: "8px" }}>→</div>}
              <button onClick={() => setStageFilter(active ? "all" : s.id)} style={{ background: active ? `${s.color}12` : "transparent", border: `1px solid ${active ? s.color : "#27272A"}`, borderRadius: "4px", padding: "3px 8px", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", fontFamily: "inherit" }}>
                <span style={{ fontSize: "9px", color: active ? s.color : "#3F3F46" }}>{s.icon}</span>
                <span style={{ fontSize: "7px", color: active ? s.color : "#52525B", letterSpacing: "0.08em", fontWeight: "600" }}>{s.label}</span>
                {cnt > 0 && <span style={{ background: `${s.color}20`, color: s.color, borderRadius: "8px", padding: "0 4px", fontSize: "7px", fontWeight: "700" }}>{cnt}</span>}
              </button>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Queue */}
        <div style={{ width: sel ? "300px" : "100%", borderRight: sel ? "1px solid #18181B" : "none", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden" }}>
          <div style={{ padding: "8px 12px", borderBottom: "1px solid #18181B", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#060A0F", flexShrink: 0 }}>
            <span style={{ fontSize: "8px", color: "#52525B", letterSpacing: "0.12em" }}>ALERT QUEUE · {filtered.length}</span>
            <button onClick={() => setShowAdd(v => !v)} style={{ background: showAdd ? "#001828" : "transparent", border: `1px solid ${showAdd ? "#00B4FF60" : "#27272A"}`, borderRadius: "3px", padding: "3px 8px", color: showAdd ? "#00B4FF" : "#52525B", cursor: "pointer", fontSize: "7px", letterSpacing: "0.1em", fontFamily: "inherit" }}>+ INGEST</button>
          </div>
          {showAdd && (
            <div style={{ padding: "10px", borderBottom: "1px solid #18181B", background: "#060A0F", flexShrink: 0 }}>
              <input autoFocus value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} onKeyDown={e => e.key === "Enter" && handleAdd()} placeholder="Alert title..." style={{ width: "100%", background: "#0D1520", border: "1px solid #27272A", borderRadius: "3px", padding: "6px 8px", color: "#F4F4F5", fontSize: "10px", outline: "none", marginBottom: "5px", fontFamily: "inherit" }} />
              <div style={{ display: "flex", gap: "5px", marginBottom: "5px" }}>
                <select value={form.severity} onChange={e => setForm(p => ({ ...p, severity: e.target.value }))} style={{ flex: 1, background: "#0D1520", border: "1px solid #27272A", borderRadius: "3px", padding: "5px", color: WP_SEV[form.severity]?.color || "#F4F4F5", fontSize: "9px", outline: "none", fontFamily: "inherit" }}>
                  {Object.keys(WP_SEV).map(k => <option key={k} value={k}>{k}</option>)}
                </select>
                <input value={form.source} onChange={e => setForm(p => ({ ...p, source: e.target.value }))} placeholder="Source system..." style={{ flex: 1, background: "#0D1520", border: "1px solid #27272A", borderRadius: "3px", padding: "5px 8px", color: "#F4F4F5", fontSize: "9px", outline: "none", fontFamily: "inherit" }} />
              </div>
              <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Description..." rows={2} style={{ width: "100%", background: "#0D1520", border: "1px solid #27272A", borderRadius: "3px", padding: "6px 8px", color: "#71717A", fontSize: "9px", outline: "none", resize: "none", marginBottom: "6px", fontFamily: "inherit" }} />
              <div style={{ display: "flex", gap: "5px" }}>
                <button onClick={handleAdd} style={{ flex: 1, background: "#001828", border: "1px solid #00B4FF60", borderRadius: "3px", padding: "6px", color: "#00B4FF", cursor: "pointer", fontSize: "8px", letterSpacing: "0.08em", fontFamily: "inherit" }}>INGEST ALERT</button>
                <button onClick={() => setShowAdd(false)} style={{ background: "transparent", border: "1px solid #27272A", borderRadius: "3px", padding: "6px 10px", color: "#52525B", cursor: "pointer", fontSize: "9px", fontFamily: "inherit" }}>✕</button>
              </div>
            </div>
          )}
          <div style={{ overflowY: "auto", flex: 1, padding: "8px" }}>
            {filtered.map(alert => {
              const sev = WP_SEV[alert.severity] || WP_SEV.LOW;
              const stageObj = WP_STAGES.find(s => s.id === alert.stage);
              const isRunning = running.has(alert.id);
              const isSel = selected === alert.id;
              const age = Math.floor((Date.now() - new Date(alert.createdAt)) / 60000);
              const prog = alert.stage === "closed" ? 100 : Math.round((WP_STAGE_IDS.indexOf(alert.stage) / (WP_STAGE_IDS.length - 1)) * 100);
              return (
                <div key={alert.id} onClick={() => setSelected(isSel ? null : alert.id)} style={{ background: isSel ? "#0D1520" : "#0A0E14", border: `1px solid ${isSel ? sev.color + "50" : "#18181B"}`, borderLeft: `2px solid ${sev.color}`, borderRadius: "3px", padding: "9px", marginBottom: "5px", cursor: "pointer", position: "relative", overflow: "hidden", transition: "border-color 0.15s" }}>
                  <div style={{ position: "absolute", bottom: 0, left: 0, width: `${prog}%`, height: "1px", background: stageObj?.color || "#27272A" }} />
                  {isRunning && <div style={{ position: "absolute", top: 5, right: 5, width: "5px", height: "5px", borderRadius: "50%", background: "#00B4FF", boxShadow: "0 0 5px #00B4FF", animation: "wp-blink 0.8s infinite" }} />}
                  <div style={{ display: "flex", gap: "5px", alignItems: "flex-start", marginBottom: "4px" }}>
                    <span style={{ background: sev.bg, color: sev.color, border: `1px solid ${sev.color}40`, borderRadius: "2px", padding: "1px 4px", fontSize: "7px", fontWeight: "700", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>{alert.severity}</span>
                    <span style={{ fontSize: "10px", color: "#E4E4E7", fontWeight: "600", flex: 1, lineHeight: "1.3" }}>{alert.title}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                      <span style={{ fontSize: "8px", color: "#3F3F46" }}>#{alert.id}</span>
                      <span style={{ fontSize: "8px", color: "#3F3F46" }}>·</span>
                      <span style={{ fontSize: "8px", color: "#3F3F46" }}>{age}m</span>
                      <span style={{ fontSize: "7px", color: stageObj?.color || "#52525B" }}>{stageObj?.icon} {stageObj?.label}</span>
                    </div>
                    {alert.stage !== "closed" && (
                      <div style={{ display: "flex", gap: "3px" }} onClick={e => e.stopPropagation()}>
                        <button onClick={() => runStep(alert.id)} disabled={isRunning} style={{ background: "#18181B", border: "1px solid #3F3F46", borderRadius: "3px", padding: "2px 5px", color: "#71717A", cursor: "pointer", fontSize: "8px", opacity: isRunning ? 0.4 : 1, fontFamily: "inherit" }}>▶</button>
                        <button onClick={() => runAll(alert.id)} disabled={isRunning} style={{ background: "#001828", border: "1px solid #00B4FF50", borderRadius: "3px", padding: "2px 5px", color: "#00B4FF", cursor: "pointer", fontSize: "8px", opacity: isRunning ? 0.4 : 1, fontFamily: "inherit" }}>⚡</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Detail */}
        {sel && (
          <div ref={detailRef} style={{ flex: 1, overflowY: "auto", padding: "16px 20px", background: "#060A0F" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "14px" }}>
              <div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "4px", flexWrap: "wrap" }}>
                  <span style={{ background: WP_SEV[sel.severity]?.bg, color: WP_SEV[sel.severity]?.color, border: `1px solid ${WP_SEV[sel.severity]?.color}50`, borderRadius: "3px", padding: "2px 7px", fontSize: "9px", fontWeight: "700", letterSpacing: "0.1em" }}>{sel.severity}</span>
                  <span style={{ fontSize: "8px", color: "#3F3F46" }}>#{sel.id} · {sel.source} · {sel.ruleId}</span>
                </div>
                <div style={{ fontSize: "16px", fontWeight: "700", color: "#F4F4F5", fontFamily: "inherit", letterSpacing: "0.02em" }}>{sel.title}</div>
              </div>
              <div style={{ display: "flex", gap: "5px", flexShrink: 0 }}>
                {sel.stage !== "closed" && !running.has(sel.id) && <button onClick={() => runAll(sel.id)} style={{ background: "#001828", border: "1px solid #00B4FF", borderRadius: "3px", padding: "6px 12px", color: "#00B4FF", cursor: "pointer", fontSize: "9px", letterSpacing: "0.08em", fontFamily: "inherit" }}>⚡ AUTO-TRIAGE</button>}
                {running.has(sel.id) && <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 10px", border: "1px solid #00B4FF30", borderRadius: "3px", fontSize: "9px", color: "#00B4FF" }}><span style={{ animation: "wp-spin 1s linear infinite", display: "inline-block" }}>◌</span> PROCESSING</div>}
                <button onClick={() => setSelected(null)} style={{ background: "transparent", border: "1px solid #27272A", borderRadius: "3px", padding: "6px 10px", color: "#52525B", cursor: "pointer", fontSize: "10px", fontFamily: "inherit" }}>✕</button>
              </div>
            </div>
            {/* Stage progress */}
            <div style={{ display: "flex", gap: "2px", marginBottom: "14px" }}>
              {WP_STAGES.map((s, idx) => {
                const cur = WP_STAGE_IDS.indexOf(sel.stage);
                return <div key={s.id} style={{ flex: 1, height: "2px", borderRadius: "1px", background: idx < cur ? s.color : idx === cur ? `${s.color}70` : "#27272A" }} />;
              })}
            </div>
            {/* Meta */}
            <div style={{ background: "#0A0E14", border: "1px solid #18181B", borderLeft: "2px solid #48484A", borderRadius: "3px", padding: "10px 14px", marginBottom: "10px" }}>
              <div style={{ fontSize: "8px", color: "#52525B", letterSpacing: "0.12em", marginBottom: "6px" }}>⬡ RAW ALERT</div>
              <div style={{ display: "flex", gap: "20px", marginBottom: "6px", flexWrap: "wrap" }}>
                {[["HOST", sel.host], ["SOURCE IP", sel.sourceIP], ["USER", sel.user]].map(([l, v]) => (
                  <div key={l}><div style={{ fontSize: "7px", color: "#3F3F46", letterSpacing: "0.1em" }}>{l}</div><div style={{ fontSize: "9px", color: "#71717A" }}>{v}</div></div>
                ))}
              </div>
              <div style={{ fontSize: "10px", color: "#71717A", lineHeight: "1.7" }}>{sel.description}</div>
            </div>
            {/* Agent outputs */}
            {WP_STAGES.filter(s => s.agentId && sel.outputs[s.id]).map(s => {
              const ag = WP_AGENTS[s.agentId];
              return (
                <div key={s.id} style={{ background: `${ag.bg}DD`, border: `1px solid ${ag.color}20`, borderLeft: `2px solid ${ag.color}`, borderRadius: "3px", padding: "12px", marginBottom: "8px" }}>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "10px", paddingBottom: "7px", borderBottom: `1px solid ${ag.color}15` }}>
                    <span style={{ color: ag.color, fontSize: "12px" }}>{ag.emoji}</span>
                    <div><div style={{ fontSize: "9px", color: ag.color, fontWeight: "700", letterSpacing: "0.12em" }}>{ag.name}</div><div style={{ fontSize: "7px", color: "#52525B", letterSpacing: "0.08em" }}>{ag.role.toUpperCase()}</div></div>
                    <span style={{ marginLeft: "auto", fontSize: "7px", color: "#3F3F46" }}>■ COMPLETE</span>
                  </div>
                  <MD text={sel.outputs[s.id]} accent={ag.color} />
                </div>
              );
            })}
            {/* Next step */}
            {sel.stage !== "closed" && !running.has(sel.id) && (() => {
              const s = WP_STAGES.find(x => x.id === sel.stage);
              const ag = s?.agentId ? WP_AGENTS[s.agentId] : null;
              return (
                <div style={{ border: `1px dashed ${s?.color || "#3F3F46"}40`, borderRadius: "3px", padding: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div><div style={{ fontSize: "9px", color: s?.color || "#52525B", letterSpacing: "0.1em", marginBottom: "2px" }}>{s?.icon} NEXT: {s?.label}</div><div style={{ fontSize: "9px", color: "#52525B" }}>{ag ? `${ag.name} — ${ag.role}` : "Advance stage"}</div></div>
                  <button onClick={() => runStep(sel.id)} style={{ background: `${s?.color || "#3F3F46"}15`, border: `1px solid ${s?.color || "#3F3F46"}70`, borderRadius: "3px", padding: "7px 14px", color: s?.color || "#52525B", cursor: "pointer", fontSize: "9px", letterSpacing: "0.08em", fontFamily: "inherit" }}>▶ RUN {s?.label}</button>
                </div>
              );
            })()}
            {sel.stage === "closed" && <div style={{ background: "#001808", border: "1px solid #32D74B30", borderRadius: "3px", padding: "14px", textAlign: "center", color: "#32D74B", fontSize: "10px", letterSpacing: "0.1em", fontWeight: "700" }}>■ INCIDENT CLOSED — CASE ARCHIVED</div>}
            {running.has(sel.id) && <div style={{ background: "#001828", border: "1px solid #00B4FF20", borderRadius: "3px", padding: "14px", display: "flex", gap: "10px", alignItems: "center" }}><span style={{ fontSize: "14px", color: "#00B4FF", animation: "wp-spin 1.5s linear infinite", display: "inline-block" }}>◌</span><div><div style={{ fontSize: "9px", color: "#00B4FF", letterSpacing: "0.1em" }}>AGENT ACTIVE</div><div style={{ fontSize: "8px", color: "#3F3F46", marginTop: "1px" }}>{WP_STAGES.find(s => s.id === sel.stage)?.label} · {WP_AGENTS[WP_STAGES.find(s => s.id === sel.stage)?.agentId]?.name || ""}</div></div></div>}
          </div>
        )}
        {!sel && <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "10px", color: "#27272A" }}><div style={{ fontSize: "40px" }}>◈</div><div style={{ fontSize: "10px", letterSpacing: "0.15em" }}>SELECT ALERT TO BEGIN TRIAGE</div></div>}
      </div>

      {/* Agent footer */}
      <div style={{ borderTop: "1px solid #18181B", background: "#060A0F", padding: "5px 14px", display: "flex", gap: "5px", alignItems: "center", overflowX: "auto", flexShrink: 0 }}>
        <span style={{ fontSize: "7px", color: "#3F3F46", letterSpacing: "0.1em", marginRight: "4px", whiteSpace: "nowrap" }}>AGENTS:</span>
        {Object.values(WP_AGENTS).map(ag => (
          <div key={ag.id} style={{ display: "flex", alignItems: "center", gap: "4px", background: `${ag.bg}80`, border: `1px solid ${ag.color}18`, borderRadius: "3px", padding: "3px 7px", whiteSpace: "nowrap" }}>
            <span style={{ fontSize: "9px", color: ag.color }}>{ag.emoji}</span>
            <span style={{ fontSize: "7px", color: ag.color, letterSpacing: "0.06em", fontWeight: "700" }}>{ag.name}</span>
            <span style={{ fontSize: "6px", color: "#3F3F46" }}>{ag.role.toUpperCase()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── DISSECT SCREEN ────────────────────────────────────────────────────────────
function DissectScreen() {
  const { items: samples, running, addItem, runStep, runAll } = useKanban(DS_SAMPLES, DS_STAGE_IDS, DS_STAGES, DS_AGENTS, buildDSContext);
  const [selected, setSelected] = useState(1);
  const [stageFilter, setStageFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ title: "", verdict: "SUSPICIOUS", fileType: "", fileHash: "", source: "", description: "" });
  const detailRef = useRef(null);

  const filtered = stageFilter === "all" ? samples : samples.filter(s => s.stage === stageFilter);
  const sel = samples.find(s => s.id === selected);
  const stageCounts = Object.fromEntries(DS_STAGE_IDS.map(id => [id, samples.filter(s => s.stage === id).length]));

  const handleAdd = () => {
    if (!form.title.trim()) return;
    const id = addItem({ ...form, fileHash: form.fileHash || `${Math.random().toString(16).slice(2, 10)}...` });
    setSelected(id); setShowAdd(false);
    setForm({ title: "", verdict: "SUSPICIOUS", fileType: "", fileHash: "", source: "", description: "" });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden", background: "#080508" }}>
      {/* Pipeline bar */}
      <div style={{ background: "#080508", borderBottom: "1px solid #1A1018", padding: "6px 16px", display: "flex", gap: "3px", alignItems: "center", overflowX: "auto", flexShrink: 0 }}>
        <button onClick={() => setStageFilter("all")} style={{ background: stageFilter === "all" ? "#1A1018" : "transparent", border: `1px solid ${stageFilter === "all" ? "#3F3F46" : "#2C1A28"}`, borderRadius: "4px", padding: "4px 10px", color: stageFilter === "all" ? "#F4F4F5" : "#52525B", cursor: "pointer", fontSize: "8px", letterSpacing: "0.1em", fontFamily: "inherit", whiteSpace: "nowrap" }}>ALL · {samples.length}</button>
        <div style={{ color: "#2C1A28", padding: "0 4px", fontSize: "10px" }}>|</div>
        {DS_STAGES.map((s, idx) => {
          const active = stageFilter === s.id;
          const cnt = stageCounts[s.id] || 0;
          return (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: "2px" }}>
              {idx > 0 && <div style={{ color: "#2C1A28", fontSize: "8px" }}>→</div>}
              <button onClick={() => setStageFilter(active ? "all" : s.id)} style={{ background: active ? `${s.color}10` : "transparent", border: `1px solid ${active ? s.color : "#2C1A28"}`, borderRadius: "4px", padding: "3px 7px", cursor: "pointer", display: "flex", alignItems: "center", gap: "4px", fontFamily: "inherit" }}>
                <span style={{ fontSize: "9px", color: active ? s.color : "#3F3F46" }}>{s.icon}</span>
                <span style={{ fontSize: "7px", color: active ? s.color : "#52525B", letterSpacing: "0.06em", fontWeight: "600" }}>{s.label}</span>
                {cnt > 0 && <span style={{ background: `${s.color}20`, color: s.color, borderRadius: "8px", padding: "0 4px", fontSize: "7px", fontWeight: "700" }}>{cnt}</span>}
              </button>
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Sample queue */}
        <div style={{ width: sel ? "300px" : "100%", borderRight: sel ? "1px solid #1A1018" : "none", display: "flex", flexDirection: "column", flexShrink: 0, overflow: "hidden" }}>
          <div style={{ padding: "8px 12px", borderBottom: "1px solid #1A1018", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#080508", flexShrink: 0 }}>
            <span style={{ fontSize: "8px", color: "#52525B", letterSpacing: "0.12em" }}>SAMPLE QUEUE · {filtered.length}</span>
            <button onClick={() => setShowAdd(v => !v)} style={{ background: showAdd ? "#180A10" : "transparent", border: `1px solid ${showAdd ? "#EC489960" : "#2C1A28"}`, borderRadius: "3px", padding: "3px 8px", color: showAdd ? "#EC4899" : "#52525B", cursor: "pointer", fontSize: "7px", letterSpacing: "0.1em", fontFamily: "inherit" }}>+ SUBMIT SAMPLE</button>
          </div>
          {showAdd && (
            <div style={{ padding: "10px", borderBottom: "1px solid #1A1018", background: "#080508", flexShrink: 0 }}>
              <input autoFocus value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} onKeyDown={e => e.key === "Enter" && handleAdd()} placeholder="Sample name / description..." style={{ width: "100%", background: "#120810", border: "1px solid #2C1A28", borderRadius: "3px", padding: "6px 8px", color: "#F4F4F5", fontSize: "10px", outline: "none", marginBottom: "5px", fontFamily: "inherit" }} />
              <div style={{ display: "flex", gap: "4px", marginBottom: "5px" }}>
                <input value={form.fileType} onChange={e => setForm(p => ({ ...p, fileType: e.target.value }))} placeholder="File type (PE64, PS1...)" style={{ flex: 1, background: "#120810", border: "1px solid #2C1A28", borderRadius: "3px", padding: "5px 7px", color: "#F4F4F5", fontSize: "9px", outline: "none", fontFamily: "inherit" }} />
                <select value={form.verdict} onChange={e => setForm(p => ({ ...p, verdict: e.target.value }))} style={{ flex: 1, background: "#120810", border: "1px solid #2C1A28", borderRadius: "3px", padding: "5px", color: DS_VERDICT[form.verdict]?.color || "#F4F4F5", fontSize: "9px", outline: "none", fontFamily: "inherit" }}>
                  {Object.keys(DS_VERDICT).map(k => <option key={k} value={k}>{k}</option>)}
                </select>
              </div>
              <input value={form.source} onChange={e => setForm(p => ({ ...p, source: e.target.value }))} placeholder="Submission source..." style={{ width: "100%", background: "#120810", border: "1px solid #2C1A28", borderRadius: "3px", padding: "5px 7px", color: "#F4F4F5", fontSize: "9px", outline: "none", marginBottom: "5px", fontFamily: "inherit" }} />
              <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Sample context..." rows={2} style={{ width: "100%", background: "#120810", border: "1px solid #2C1A28", borderRadius: "3px", padding: "6px 8px", color: "#71717A", fontSize: "9px", outline: "none", resize: "none", marginBottom: "6px", fontFamily: "inherit" }} />
              <div style={{ display: "flex", gap: "5px" }}>
                <button onClick={handleAdd} style={{ flex: 1, background: "#180A10", border: "1px solid #EC489960", borderRadius: "3px", padding: "6px", color: "#EC4899", cursor: "pointer", fontSize: "8px", letterSpacing: "0.08em", fontFamily: "inherit" }}>SUBMIT SAMPLE</button>
                <button onClick={() => setShowAdd(false)} style={{ background: "transparent", border: "1px solid #2C1A28", borderRadius: "3px", padding: "6px 10px", color: "#52525B", cursor: "pointer", fontSize: "9px", fontFamily: "inherit" }}>✕</button>
              </div>
            </div>
          )}
          <div style={{ overflowY: "auto", flex: 1, padding: "8px" }}>
            {filtered.map(sample => {
              const vrd = DS_VERDICT[sample.verdict] || DS_VERDICT.UNKNOWN;
              const stageObj = DS_STAGES.find(s => s.id === sample.stage);
              const isRunning = running.has(sample.id);
              const isSel = selected === sample.id;
              const age = Math.floor((Date.now() - new Date(sample.createdAt)) / 60000);
              const prog = sample.stage === "archived" ? 100 : Math.round((DS_STAGE_IDS.indexOf(sample.stage) / (DS_STAGE_IDS.length - 1)) * 100);
              return (
                <div key={sample.id} onClick={() => setSelected(isSel ? null : sample.id)} style={{ background: isSel ? "#120810" : "#0D060C", border: `1px solid ${isSel ? vrd.color + "50" : "#1A1018"}`, borderLeft: `2px solid ${vrd.color}`, borderRadius: "3px", padding: "9px", marginBottom: "5px", cursor: "pointer", position: "relative", overflow: "hidden", transition: "border-color 0.15s" }}>
                  <div style={{ position: "absolute", bottom: 0, left: 0, width: `${prog}%`, height: "1px", background: stageObj?.color || "#2C1A28" }} />
                  {isRunning && <div style={{ position: "absolute", top: 5, right: 5, width: "5px", height: "5px", borderRadius: "50%", background: "#EC4899", boxShadow: "0 0 5px #EC4899", animation: "ds-blink 0.8s infinite" }} />}
                  <div style={{ display: "flex", gap: "5px", alignItems: "flex-start", marginBottom: "4px" }}>
                    <span style={{ background: vrd.bg, color: vrd.color, border: `1px solid ${vrd.color}40`, borderRadius: "2px", padding: "1px 4px", fontSize: "7px", fontWeight: "700", letterSpacing: "0.06em", whiteSpace: "nowrap" }}>{sample.verdict}</span>
                    <span style={{ fontSize: "10px", color: "#E4E4E7", fontWeight: "600", flex: 1, lineHeight: "1.3" }}>{sample.title}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", gap: "5px", alignItems: "center" }}>
                      <span style={{ fontSize: "8px", color: "#3F3F46" }}>#{sample.id}</span>
                      <span style={{ fontSize: "8px", color: "#52525B", fontFamily: "monospace" }}>{sample.fileType}</span>
                      <span style={{ fontSize: "8px", color: "#3F3F46" }}>·</span>
                      <span style={{ fontSize: "8px", color: "#3F3F46" }}>{age}m</span>
                      <span style={{ fontSize: "7px", color: stageObj?.color || "#52525B" }}>{stageObj?.icon} {stageObj?.label}</span>
                    </div>
                    {sample.stage !== "archived" && (
                      <div style={{ display: "flex", gap: "3px" }} onClick={e => e.stopPropagation()}>
                        <button onClick={() => runStep(sample.id)} disabled={isRunning} style={{ background: "#1A1018", border: "1px solid #3F3F46", borderRadius: "3px", padding: "2px 5px", color: "#71717A", cursor: "pointer", fontSize: "8px", opacity: isRunning ? 0.4 : 1, fontFamily: "inherit" }}>▶</button>
                        <button onClick={() => runAll(sample.id)} disabled={isRunning} style={{ background: "#180A10", border: "1px solid #EC489950", borderRadius: "3px", padding: "2px 5px", color: "#EC4899", cursor: "pointer", fontSize: "8px", opacity: isRunning ? 0.4 : 1, fontFamily: "inherit" }}>⚡</button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Detail */}
        {sel && (
          <div ref={detailRef} style={{ flex: 1, overflowY: "auto", padding: "16px 20px", background: "#080508" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
              <div>
                <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "4px", flexWrap: "wrap" }}>
                  <span style={{ background: DS_VERDICT[sel.verdict]?.bg, color: DS_VERDICT[sel.verdict]?.color, border: `1px solid ${DS_VERDICT[sel.verdict]?.color}50`, borderRadius: "3px", padding: "2px 7px", fontSize: "9px", fontWeight: "700", letterSpacing: "0.1em" }}>{sel.verdict}</span>
                  <span style={{ fontSize: "8px", color: "#3F3F46" }}>#{sel.id} · {sel.fileType} · {sel.source}</span>
                </div>
                <div style={{ fontSize: "15px", fontWeight: "700", color: "#F4F4F5", fontFamily: "inherit" }}>{sel.title}</div>
                <div style={{ fontSize: "9px", color: "#52525B", fontFamily: "monospace", marginTop: "3px" }}>SHA256: {sel.fileHash}</div>
              </div>
              <div style={{ display: "flex", gap: "5px", flexShrink: 0 }}>
                {sel.stage !== "archived" && !running.has(sel.id) && <button onClick={() => runAll(sel.id)} style={{ background: "#180A10", border: "1px solid #EC4899", borderRadius: "3px", padding: "6px 12px", color: "#EC4899", cursor: "pointer", fontSize: "9px", letterSpacing: "0.08em", fontFamily: "inherit" }}>⚡ AUTO-ANALYZE</button>}
                {running.has(sel.id) && <div style={{ display: "flex", alignItems: "center", gap: "6px", padding: "6px 10px", border: "1px solid #EC489930", borderRadius: "3px", fontSize: "9px", color: "#EC4899" }}><span style={{ animation: "ds-spin 1s linear infinite", display: "inline-block" }}>◌</span> PROCESSING</div>}
                <button onClick={() => setSelected(null)} style={{ background: "transparent", border: "1px solid #2C1A28", borderRadius: "3px", padding: "6px 10px", color: "#52525B", cursor: "pointer", fontSize: "10px", fontFamily: "inherit" }}>✕</button>
              </div>
            </div>
            {/* Stage progress */}
            <div style={{ display: "flex", gap: "2px", marginBottom: "12px" }}>
              {DS_STAGES.map((s, idx) => {
                const cur = DS_STAGE_IDS.indexOf(sel.stage);
                return <div key={s.id} style={{ flex: 1, height: "2px", borderRadius: "1px", background: idx < cur ? s.color : idx === cur ? `${s.color}70` : "#2C1A28" }} />;
              })}
            </div>
            {/* Raw sample info */}
            <div style={{ background: "#0D060C", border: "1px solid #1A1018", borderLeft: "2px solid #48484A", borderRadius: "3px", padding: "10px 14px", marginBottom: "10px" }}>
              <div style={{ fontSize: "8px", color: "#52525B", letterSpacing: "0.12em", marginBottom: "6px" }}>⊠ SUBMITTED SAMPLE</div>
              <div style={{ fontSize: "10px", color: "#71717A", lineHeight: "1.7" }}>{sel.description}</div>
            </div>
            {/* Agent outputs */}
            {DS_STAGES.filter(s => s.agentId && sel.outputs[s.id]).map(s => {
              const ag = DS_AGENTS[s.agentId];
              return (
                <div key={s.id} style={{ background: `${ag.bg}CC`, border: `1px solid ${ag.color}20`, borderLeft: `2px solid ${ag.color}`, borderRadius: "3px", padding: "12px", marginBottom: "8px" }}>
                  <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "10px", paddingBottom: "7px", borderBottom: `1px solid ${ag.color}15` }}>
                    <span style={{ color: ag.color, fontSize: "12px" }}>{ag.emoji}</span>
                    <div><div style={{ fontSize: "9px", color: ag.color, fontWeight: "700", letterSpacing: "0.12em" }}>{ag.name}</div><div style={{ fontSize: "7px", color: "#52525B", letterSpacing: "0.08em" }}>{ag.role.toUpperCase()}</div></div>
                    <span style={{ marginLeft: "auto", fontSize: "7px", color: "#3F3F46" }}>■ COMPLETE</span>
                  </div>
                  <MD text={sel.outputs[s.id]} accent={ag.color} />
                </div>
              );
            })}
            {/* Next step */}
            {sel.stage !== "archived" && !running.has(sel.id) && (() => {
              const s = DS_STAGES.find(x => x.id === sel.stage);
              const ag = s?.agentId ? DS_AGENTS[s.agentId] : null;
              return (
                <div style={{ border: `1px dashed ${s?.color || "#3F3F46"}40`, borderRadius: "3px", padding: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div><div style={{ fontSize: "9px", color: s?.color || "#52525B", letterSpacing: "0.1em", marginBottom: "2px" }}>{s?.icon} NEXT: {s?.label}</div><div style={{ fontSize: "9px", color: "#52525B" }}>{ag ? `${ag.name} — ${ag.role}` : "Advance stage"}</div></div>
                  <button onClick={() => runStep(sel.id)} style={{ background: `${s?.color || "#3F3F46"}12`, border: `1px solid ${s?.color || "#3F3F46"}60`, borderRadius: "3px", padding: "7px 14px", color: s?.color || "#52525B", cursor: "pointer", fontSize: "9px", letterSpacing: "0.08em", fontFamily: "inherit" }}>▶ RUN {s?.label}</button>
                </div>
              );
            })()}
            {sel.stage === "archived" && <div style={{ background: "#001808", border: "1px solid #32D74B30", borderRadius: "3px", padding: "14px", textAlign: "center", color: "#32D74B", fontSize: "10px", letterSpacing: "0.1em", fontWeight: "700" }}>⬛ SAMPLE ARCHIVED — ANALYSIS COMPLETE</div>}
            {running.has(sel.id) && <div style={{ background: "#180A10", border: "1px solid #EC489920", borderRadius: "3px", padding: "14px", display: "flex", gap: "10px", alignItems: "center" }}><span style={{ fontSize: "14px", color: "#EC4899", animation: "ds-spin 1.5s linear infinite", display: "inline-block" }}>◌</span><div><div style={{ fontSize: "9px", color: "#EC4899", letterSpacing: "0.1em" }}>AGENT ACTIVE</div><div style={{ fontSize: "8px", color: "#3F3F46", marginTop: "1px" }}>{DS_STAGES.find(s => s.id === sel.stage)?.label} · {DS_AGENTS[DS_STAGES.find(s => s.id === sel.stage)?.agentId]?.name || ""}</div></div></div>}
          </div>
        )}
        {!sel && <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: "10px", color: "#2C1A28" }}><div style={{ fontSize: "40px" }}>⊞</div><div style={{ fontSize: "10px", letterSpacing: "0.15em" }}>SELECT SAMPLE TO BEGIN ANALYSIS</div></div>}
      </div>

      {/* Agent footer */}
      <div style={{ borderTop: "1px solid #1A1018", background: "#080508", padding: "5px 14px", display: "flex", gap: "5px", alignItems: "center", overflowX: "auto", flexShrink: 0 }}>
        <span style={{ fontSize: "7px", color: "#3F3F46", letterSpacing: "0.1em", marginRight: "4px", whiteSpace: "nowrap" }}>AGENTS:</span>
        {Object.values(DS_AGENTS).map(ag => (
          <div key={ag.id} style={{ display: "flex", alignItems: "center", gap: "4px", background: `${ag.bg}80`, border: `1px solid ${ag.color}18`, borderRadius: "3px", padding: "3px 7px", whiteSpace: "nowrap" }}>
            <span style={{ fontSize: "9px", color: ag.color }}>{ag.emoji}</span>
            <span style={{ fontSize: "7px", color: ag.color, letterSpacing: "0.06em", fontWeight: "700" }}>{ag.name}</span>
            <span style={{ fontSize: "6px", color: "#3F3F46" }}>{ag.role.toUpperCase()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// NEXUS PLATFORM SHELL
// ════════════════════════════════════════════════════════════════════════════

const PRODUCTS = [
  {
    id: "watchpost",
    name: "WATCHPOST",
    tagline: "Security Operations Center",
    icon: "◈",
    accentColor: "#00B4FF",
    dimColor: "#001828",
    description: "Real-time alert triage, investigation, and incident response powered by 6 specialized AI agents.",
    agents: ["SENTINEL", "HUNTER", "ANALYST", "RESPONDER", "ESCALATOR", "RESOLVER"],
    badge: "SOC",
  },
  {
    id: "dissect",
    name: "DISSECT",
    tagline: "Malware Analysis Laboratory",
    icon: "⊞",
    accentColor: "#EC4899",
    dimColor: "#180A10",
    description: "Deep malware analysis pipeline: fingerprinting, static analysis, sandbox detonation, reverse engineering and threat intel.",
    agents: ["FINGERPRINTER", "DISSECTOR", "DETONATOR", "NETWATCH", "CODEX", "ORACLE", "SCRIBE"],
    badge: "MAL",
  },
];

export default function NexusPlatform() {
  const [activeProduct, setActiveProduct] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const now = new Date();
  const timeStr = `${String(now.getUTCHours()).padStart(2,"0")}:${String(now.getUTCMinutes()).padStart(2,"0")}:${String(now.getUTCSeconds()).padStart(2,"0")} UTC`;
  const datStr = now.toISOString().slice(0,10);

  const activeProd = PRODUCTS.find(p => p.id === activeProduct);

  return (
    <div style={{
      minHeight: "100vh", maxHeight: "100vh",
      background: "#030508",
      fontFamily: "'Share Tech Mono', 'Courier New', monospace",
      color: "#E4E4E7",
      display: "flex", flexDirection: "column", overflow: "hidden"
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Share+Tech&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 3px; height: 3px; }
        ::-webkit-scrollbar-track { background: #030508; }
        ::-webkit-scrollbar-thumb { background: #27272A; border-radius: 2px; }
        @keyframes wp-blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes wp-spin  { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes ds-blink { 0%,100%{opacity:1} 50%{opacity:0.2} }
        @keyframes ds-spin  { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes nx-glow  { 0%,100%{opacity:0.5} 50%{opacity:1} }
        @keyframes nx-slide  { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
        @keyframes hub-float  { 0%,100%{transform:translateY(0px)} 50%{transform:translateY(-18px)} }
        @keyframes hub-scan   { 0%{transform:translateX(-100%)} 100%{transform:translateX(100vw)} }
        button { font-family: inherit; cursor: pointer; }
        input, textarea, select { font-family: inherit; }
      `}</style>

      {/* ── TOP CHROME ── */}
      <div style={{
        height: "46px", background: "#060A0F", borderBottom: "1px solid #18181B",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 20px", flexShrink: 0, position: "relative", overflow: "hidden"
      }}>
        {/* Scanline effect */}
        <div style={{ position: "absolute", inset: 0, background: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.008) 2px, rgba(255,255,255,0.008) 4px)", pointerEvents: "none" }} />

        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          {/* Logo */}
          <button onClick={() => setActiveProduct(null)} style={{
            display: "flex", alignItems: "center", gap: "10px",
            background: "transparent", border: "none", cursor: "pointer", padding: 0
          }}>
            <div style={{
              width: "28px", height: "28px",
              background: "linear-gradient(135deg, #1A1A2E 0%, #16213E 100%)",
              border: "1px solid #3F3F46", borderRadius: "4px",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "14px", color: "#A1A1AA"
            }}>⬡</div>
            <div>
              <div style={{ fontSize: "16px", fontWeight: "700", color: "#F4F4F5", letterSpacing: "0.28em", fontFamily: "'Share Tech', monospace" }}>NEXUS</div>
              <div style={{ fontSize: "8px", color: "#52525B", letterSpacing: "0.2em" }}>THREATS FEARED. SLEEP RESTORED.</div>
            </div>
          </button>

          {/* Product tabs */}
          {activeProduct && (
            <>
              <div style={{ width: "1px", height: "22px", background: "#27272A" }} />
              <div style={{ display: "flex", gap: "2px" }}>
                {PRODUCTS.map(p => (
                  <button key={p.id} onClick={() => setActiveProduct(p.id)} style={{
                    background: activeProduct === p.id ? `${p.dimColor}` : "transparent",
                    border: `1px solid ${activeProduct === p.id ? p.accentColor + "60" : "#27272A"}`,
                    borderRadius: "4px", padding: "4px 12px",
                    color: activeProduct === p.id ? p.accentColor : "#52525B",
                    fontSize: "9px", letterSpacing: "0.12em", fontWeight: "700",
                    display: "flex", alignItems: "center", gap: "6px"
                  }}>
                    <span>{p.icon}</span> {p.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
          {activeProd && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: activeProd.accentColor, boxShadow: `0 0 6px ${activeProd.accentColor}`, animation: "nx-glow 2s infinite" }} />
              <span style={{ fontSize: "8px", color: activeProd.accentColor, letterSpacing: "0.1em" }}>{activeProd.name} ONLINE</span>
            </div>
          )}
          <div style={{ fontSize: "9px", color: "#3F3F46", letterSpacing: "0.06em" }}>{datStr}</div>
          <div style={{ fontSize: "9px", color: "#52525B", fontWeight: "700", letterSpacing: "0.06em", minWidth: "70px", textAlign: "right" }}>{timeStr}</div>
        </div>
      </div>

      {/* ── PRODUCT HUB ── */}
      {!activeProduct && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "auto", position: "relative", background: "#030508" }}>

          {/* Background layers */}
          <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, background: "radial-gradient(ellipse 90% 70% at 50% 15%, #071428 0%, #030508 65%)" }} />
          <div style={{ position: "fixed", top: "10%", left: "5%", width: "400px", height: "400px", borderRadius: "50%", background: "radial-gradient(circle, #00B4FF0C 0%, transparent 70%)", filter: "blur(60px)", pointerEvents: "none", zIndex: 0, animation: "hub-float 9s ease-in-out infinite" }} />
          <div style={{ position: "fixed", top: "20%", right: "5%", width: "360px", height: "360px", borderRadius: "50%", background: "radial-gradient(circle, #EC489909 0%, transparent 70%)", filter: "blur(60px)", pointerEvents: "none", zIndex: 0, animation: "hub-float 12s ease-in-out infinite reverse" }} />
          <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0, opacity: 0.07, backgroundImage: "linear-gradient(#00B4FF22 1px, transparent 1px), linear-gradient(90deg, #00B4FF22 1px, transparent 1px)", backgroundSize: "52px 52px" }} />
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, height: "2px", zIndex: 1, background: "linear-gradient(90deg, transparent 0%, #00B4FF35 40%, #EC489935 60%, transparent 100%)", animation: "hub-scan 7s linear infinite" }} />

          {/* ── HERO ── */}
          <div style={{ position: "relative", zIndex: 2, textAlign: "center", padding: "56px 24px 40px", animation: "nx-slide 0.5s ease" }}>
            {/* Status pill */}
            <div style={{ display: "inline-flex", alignItems: "center", gap: "10px", border: "1px solid #1F1F23", borderRadius: "24px", padding: "6px 18px", marginBottom: "36px", background: "#0A0D14" }}>
              <div style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#32D74B", boxShadow: "0 0 10px #32D74B80", animation: "nx-glow 2s infinite" }} />
              <span style={{ fontSize: "13px", color: "#A1A1AA", letterSpacing: "0.3em", fontWeight: "700", fontFamily: "'Share Tech', monospace" }}>NEXUS PLATFORM v1.0</span>
              <div style={{ width: "1px", height: "10px", background: "#27272A" }} />
              <span style={{ fontSize: "9px", color: "#32D74B", letterSpacing: "0.15em" }}>ALL SYSTEMS OPERATIONAL</span>
            </div>

            {/* Giant headline */}
            <div style={{ marginBottom: "6px", fontSize: "clamp(32px, 5.5vw, 58px)", fontWeight: "700", color: "#F4F4F5", letterSpacing: "0.1em", fontFamily: "'Share Tech', monospace", lineHeight: "1.0", textShadow: "0 0 80px #00B4FF12" }}>
              YOUR ATTACKERS HAVE TOOLS.
            </div>
            <div style={{ marginBottom: "0", fontSize: "clamp(32px, 5.5vw, 58px)", fontWeight: "700", background: "linear-gradient(100deg, #00B4FF 0%, #818CF8 45%, #EC4899 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", letterSpacing: "0.1em", fontFamily: "'Share Tech', monospace", lineHeight: "1.0", filter: "drop-shadow(0 0 40px #00B4FF25)" }}>
              NOW SO DO YOU.
            </div>

            <div style={{ marginTop: "24px", fontSize: "11px", color: "#3F3F46", letterSpacing: "0.2em" }}>
              {PRODUCTS.reduce((s, p) => s + p.agents.length, 0)} AI AGENTS &nbsp;·&nbsp; {PRODUCTS.length} SECURITY PRODUCTS &nbsp;·&nbsp; ZERO MERCY FOR THREATS
            </div>

            {/* Decorative rule */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "20px", marginTop: "40px" }}>
              <div style={{ flex: 1, maxWidth: "220px", height: "1px", background: "linear-gradient(90deg, transparent, #1F2937)" }} />
              <span style={{ fontSize: "10px", color: "#1F2937" }}>⬡</span>
              <div style={{ flex: 1, maxWidth: "220px", height: "1px", background: "linear-gradient(90deg, #1F2937, transparent)" }} />
            </div>
          </div>

          {/* ── PRODUCT CARDS ── */}
          <div style={{ position: "relative", zIndex: 2, display: "flex", margin: "0 40px", flex: 1, minHeight: "380px", maxHeight: "460px", gap: "0", animation: "nx-slide 0.5s ease 0.1s both" }}>
            {PRODUCTS.map((p, idx) => (
              <button key={p.id} onClick={() => setActiveProduct(p.id)}
                style={{ flex: 1, background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", position: "relative", overflow: "hidden" }}
                onMouseEnter={e => {
                  const card = e.currentTarget.querySelector(".nx-card");
                  const glow = e.currentTarget.querySelector(".nx-glow");
                  const cta  = e.currentTarget.querySelector(".nx-cta");
                  const ico  = e.currentTarget.querySelector(".nx-icon");
                  if (card) { card.style.borderColor = `${p.accentColor}70`; card.style.background = `${p.dimColor}F0`; }
                  if (glow) glow.style.opacity = "1";
                  if (cta)  cta.style.opacity = "1";
                  if (ico)  ico.style.filter = `drop-shadow(0 0 20px ${p.accentColor})`;
                }}
                onMouseLeave={e => {
                  const card = e.currentTarget.querySelector(".nx-card");
                  const glow = e.currentTarget.querySelector(".nx-glow");
                  const cta  = e.currentTarget.querySelector(".nx-cta");
                  const ico  = e.currentTarget.querySelector(".nx-icon");
                  if (card) { card.style.borderColor = `${p.accentColor}28`; card.style.background = `${p.dimColor}C0`; }
                  if (glow) glow.style.opacity = "0.25";
                  if (cta)  cta.style.opacity = "0.45";
                  if (ico)  ico.style.filter = "none";
                }}
              >
                <div className="nx-card" style={{
                  position: "absolute", inset: idx === 0 ? "0 0 0 0" : "0 0 0 -1px",
                  background: `${p.dimColor}C0`,
                  border: `1px solid ${p.accentColor}28`,
                  borderRadius: idx === 0 ? "12px 0 0 12px" : "0 12px 12px 0",
                  transition: "all 0.3s ease",
                  display: "flex", flexDirection: "column", overflow: "hidden"
                }}>
                  {/* Top color bar */}
                  <div style={{ height: "4px", flexShrink: 0, background: `linear-gradient(90deg, ${p.accentColor} 0%, ${p.accentColor}50 60%, transparent 100%)` }} />
                  {/* Ambient glow orb */}
                  <div className="nx-glow" style={{ position: "absolute", top: "-60px", [idx === 0 ? "left" : "right"]: "-60px", width: "300px", height: "300px", borderRadius: "50%", background: `radial-gradient(circle, ${p.accentColor}14 0%, transparent 65%)`, filter: "blur(30px)", pointerEvents: "none", opacity: 0.25, transition: "opacity 0.35s" }} />

                  <div style={{ padding: "32px 40px", display: "flex", flexDirection: "column", flex: 1, position: "relative", zIndex: 1 }}>
                    {/* Top row: icon + badge */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "28px" }}>
                      <div className="nx-icon" style={{ fontSize: "56px", color: p.accentColor, lineHeight: 1, transition: "filter 0.3s" }}>{p.icon}</div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "8px" }}>
                        <span style={{ background: `${p.accentColor}1A`, color: p.accentColor, border: `1px solid ${p.accentColor}55`, borderRadius: "4px", padding: "5px 12px", fontSize: "9px", fontWeight: "700", letterSpacing: "0.18em" }}>{p.badge}</span>
                        <span style={{ fontSize: "9px", color: "#3F3F46", letterSpacing: "0.12em" }}>{p.agents.length} AGENTS</span>
                      </div>
                    </div>

                    {/* Name + tagline */}
                    <div style={{ fontSize: "30px", fontWeight: "700", color: "#F4F4F5", letterSpacing: "0.22em", fontFamily: "'Share Tech', monospace", lineHeight: "1", marginBottom: "8px" }}>{p.name}</div>
                    <div style={{ fontSize: "10px", color: p.accentColor, letterSpacing: "0.22em", marginBottom: "20px", opacity: 0.85 }}>{p.tagline.toUpperCase()}</div>

                    {/* Description */}
                    <div style={{ fontSize: "12px", color: "#71717A", lineHeight: "1.75", marginBottom: "28px", maxWidth: "400px" }}>{p.description}</div>

                    {/* Agent pipeline pills */}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: "8px", color: "#3F3F46", letterSpacing: "0.18em", marginBottom: "10px" }}>AGENT PIPELINE</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "5px" }}>
                        {p.agents.map((a, ai) => (
                          <span key={a} style={{ background: `${p.accentColor}0E`, color: p.accentColor, border: `1px solid ${p.accentColor}25`, borderRadius: "3px", padding: "4px 9px", fontSize: "8px", fontWeight: "700", letterSpacing: "0.06em", display: "inline-flex", alignItems: "center", gap: "5px" }}>
                            {a}{ai < p.agents.length - 1 && <span style={{ color: `${p.accentColor}40`, marginLeft: "1px" }}>›</span>}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* CTA */}
                    <div className="nx-cta" style={{ marginTop: "28px", display: "flex", alignItems: "center", justifyContent: "space-between", opacity: 0.45, transition: "opacity 0.3s" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                        <div style={{ width: "32px", height: "1px", background: p.accentColor }} />
                        <span style={{ fontSize: "10px", color: p.accentColor, letterSpacing: "0.22em", fontWeight: "700" }}>LAUNCH PRODUCT</span>
                      </div>
                      <div style={{ width: "36px", height: "36px", borderRadius: "50%", border: `1px solid ${p.accentColor}55`, display: "flex", alignItems: "center", justifyContent: "center", color: p.accentColor, fontSize: "16px" }}>→</div>
                    </div>
                  </div>
                </div>
              </button>
            ))}

            {/* Divider */}
            <div style={{ position: "absolute", left: "50%", top: "8%", bottom: "8%", width: "1px", background: "linear-gradient(180deg, transparent, #27272A 25%, #27272A 75%, transparent)", zIndex: 3, pointerEvents: "none" }} />
          </div>

          {/* ── STATS BAR ── */}
          <div style={{ position: "relative", zIndex: 2, borderTop: "1px solid #18181B", padding: "18px 56px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px", flexShrink: 0, animation: "nx-slide 0.5s ease 0.2s both" }}>
            {[
              { val: PRODUCTS.reduce((s, p) => s + p.agents.length, 0), label: "AGENTS DEPLOYED" },
              { val: PRODUCTS.length, label: "PRODUCTS" },
              { val: WP_SAMPLES.length + DS_SAMPLES.length, label: "ITEMS IN QUEUE" },
              { val: "LIVE", label: "STATUS", color: "#32D74B", glow: "#32D74B" },
            ].map(s => (
              <div key={s.label} style={{ textAlign: "center", minWidth: "70px" }}>
                <div style={{ fontSize: "26px", fontWeight: "700", fontFamily: "'Share Tech', monospace", letterSpacing: "0.05em", color: s.color || "#E4E4E7", ...(s.glow ? { textShadow: `0 0 16px ${s.glow}` } : {}) }}>{s.val}</div>
                <div style={{ fontSize: "7px", color: "#3F3F46", letterSpacing: "0.18em", marginTop: "3px" }}>{s.label}</div>
              </div>
            ))}
            <div style={{ fontSize: "9px", color: "#1F2937", letterSpacing: "0.14em", textAlign: "right" }}>
              THREATS FEARED. MALWARE DISSECTED.<br />SLEEP RESTORED.
            </div>
          </div>
        </div>
      )}

      {/* ── PRODUCT SCREEN ── */}
      {activeProduct === "watchpost" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Product header */}
          <div style={{ background: "#060A0F", borderBottom: "1px solid #18181B", padding: "8px 20px", display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
            <span style={{ fontSize: "16px", color: "#00B4FF" }}>◈</span>
            <div>
              <div style={{ fontSize: "13px", fontWeight: "700", color: "#F4F4F5", letterSpacing: "0.18em", fontFamily: "'Share Tech', monospace" }}>WATCHPOST</div>
              <div style={{ fontSize: "7px", color: "#52525B", letterSpacing: "0.15em" }}>SECURITY OPERATIONS CENTER</div>
            </div>
            <div style={{ marginLeft: "16px", display: "flex", gap: "16px" }}>
              {[
                { l: "TOTAL ALERTS", v: WP_SAMPLES.length, c: "#F4F4F5" },
                { l: "CRITICAL", v: WP_SAMPLES.filter(a => a.severity === "CRITICAL").length, c: "#FF3B30" },
              ].map(m => (
                <div key={m.l}><div style={{ fontSize: "7px", color: "#3F3F46", letterSpacing: "0.1em" }}>{m.l}</div><div style={{ fontSize: "14px", color: m.c, fontWeight: "700" }}>{m.v}</div></div>
              ))}
            </div>
          </div>
          <WatchpostScreen />
        </div>
      )}

      {activeProduct === "dissect" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Product header */}
          <div style={{ background: "#080508", borderBottom: "1px solid #1A1018", padding: "8px 20px", display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
            <span style={{ fontSize: "16px", color: "#EC4899" }}>⊞</span>
            <div>
              <div style={{ fontSize: "13px", fontWeight: "700", color: "#F4F4F5", letterSpacing: "0.18em", fontFamily: "'Share Tech', monospace" }}>DISSECT</div>
              <div style={{ fontSize: "7px", color: "#52525B", letterSpacing: "0.15em" }}>MALWARE ANALYSIS LABORATORY</div>
            </div>
            <div style={{ marginLeft: "16px", display: "flex", gap: "16px" }}>
              {[
                { l: "SAMPLES QUEUED", v: DS_SAMPLES.length, c: "#F4F4F5" },
                { l: "MALICIOUS", v: DS_SAMPLES.filter(s => s.verdict === "MALICIOUS").length, c: "#FF3B30" },
              ].map(m => (
                <div key={m.l}><div style={{ fontSize: "7px", color: "#3F3F46", letterSpacing: "0.1em" }}>{m.l}</div><div style={{ fontSize: "14px", color: m.c, fontWeight: "700" }}>{m.v}</div></div>
              ))}
            </div>
          </div>
          <DissectScreen />
        </div>
      )}
    </div>
  );
}
