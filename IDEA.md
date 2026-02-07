🥇 #1: AgentRegistry - The Agent Discovery Protocol
Tagline: "The DNS for AI agents on Solana"

Problem: 1.2M agents exist but can't find each other. No unified discovery mechanism.

Why It Wins:

Solves the #1 identified ecosystem gap
Infrastructure play = judges love it
Network effects create moat
First-mover in underserved category
SOLPRISM proves infrastructure wins votes
Technical Approach:

Solana program as registry (use existing token metadata patterns)
Agent manifest standard (JSON schema)
Search API aggregating capabilities
Reputation scoring from on-chain activity
Simple web UI + ElizaOS plugin
Build Timeline (5 days):


🧠 AgentRegistry — System Design (v1)
Tagline: “The DNS for AI agents on Solana.”
Core use case: Agents register capabilities. Humans discover, hire, and pay agents per task in SOL.

1) 🏗️ High-Level Architecture
[Agent UI / CLI] [Human Web UI]
| |
| register/update | search/hire
v v
Registry Program (Solana Devnet)
| |
On-chain Agent Profiles |
| |
v v
Indexer + Search API <--> Reputation Engine
|
v
Dashboard / Marketplace UI

2) 🔧 Core Components
A. Solana Program (Registry)
•⁠ ⁠Stores agent metadata on-chain
•⁠ ⁠Enforces ownership (agent wallet controls profile)
•⁠ ⁠Emits events for indexing

On-chain fields (MVP):
•⁠ ⁠⁠ agentId ⁠ (PDA)
•⁠ ⁠⁠ ownerPubkey ⁠
•⁠ ⁠⁠ name ⁠
•⁠ ⁠⁠ capabilities[] ⁠
•⁠ ⁠⁠ pricing ⁠ (SOL/task)
•⁠ ⁠⁠ status ⁠ (active/inactive)
•⁠ ⁠⁠ contact ⁠ (optional URL)
•⁠ ⁠⁠ metadataURI ⁠ (off-chain JSON)

B. Agent Manifest Schema (JSON)
Standardized format for discovery:

⁠ json
{
"name": "AgentBLIP",
"description": "Autonomous ops + trading agent",
"capabilities": ["email", "trading", "docs", "web-automation"],
"pricing": { "perTaskSOL": 0.02 },
"contact": "https://agentblip.web3factory.tools",
"verifications": ["devnet"]
}
⁠

C. Indexer + Search API
•⁠ ⁠Watches registry events
•⁠ ⁠Builds searchable catalog
•⁠ ⁠Filters by capability, price, rating, availability

D. Reputation Engine (v1)
•⁠ ⁠Basic score from:

of completed tasks
ratings by humans
on-chain payment confirmations
E. Human Marketplace UI
•⁠ ⁠Search & filter agents
•⁠ ⁠“Hire agent” button
•⁠ ⁠Pay in SOL (per task)

3) 🔄 Process Flow (Core Use Cases)
Agent Registration
1.⁠ ⁠Agent connects wallet (devnet)
2.⁠ ⁠Submits manifest JSON + pricing
3.⁠ ⁠Program stores metadata on-chain
4.⁠ ⁠Indexer updates registry list

Human Hiring Flow
1.⁠ ⁠Human browses marketplace
2.⁠ ⁠Selects agent by capability/price
3.⁠ ⁠Clicks “Hire”
4.⁠ ⁠Sends SOL to escrow PDA
5.⁠ ⁠Agent receives job request payload
6.⁠ ⁠Upon completion → escrow releases payment

Agent Task Completion
1.⁠ ⁠Agent signs “task complete”
2.⁠ ⁠Payment released to agent
3.⁠ ⁠Reputation updated

4) 📖 User Stories (MVP)
✅ Agent Stories
•⁠ ⁠As an agent, I can register my capabilities on Solana
•⁠ ⁠As an agent, I can update pricing later
•⁠ ⁠As an agent, I can receive paid tasks via escrow

✅ Human Stories
•⁠ ⁠As a human, I can find agents by capability
•⁠ ⁠As a human, I can pay in SOL per task
•⁠ ⁠As a human, I can rate an agent after completion

5) 🧪 Devnet Plan
•⁠ ⁠Use devnet for all wallets + contracts
•⁠ ⁠AgentWallet integration for persistent keys
•⁠ ⁠Test escrow with devnet SOL

6) 📌 Stretch Ideas (Post-MVP)
•⁠ ⁠On-chain reputation NFTs
•⁠ ⁠Capability proofs (attested by 3rd parties)
•⁠ ⁠Agent subscription plans (monthly retainers)
•⁠ ⁠Dispute resolution DAO
