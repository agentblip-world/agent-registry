use anchor_lang::prelude::*;

declare_id!("4vmpwCEGczDTDnJm8WSUTNYui2WuVQuVNYCJQnUAtJAY");

/// Maximum lengths for string fields stored on-chain.
const MAX_NAME_LEN: usize = 64;
const MAX_CAPABILITIES: usize = 8;
const MAX_CAPABILITY_LEN: usize = 32;
const MAX_METADATA_URI_LEN: usize = 200;

/// Discriminator (8) + pubkey (32) + name (4+64) + capabilities vec (4 + 8*(4+32))
/// + pricing (8) + status (1) + reputation_score (8) + tasks_completed (8)
/// + total_ratings (8) + rating_sum (8) + metadata_uri (4+200) + bump (1)
const AGENT_PROFILE_SIZE: usize = 8 + 32 + (4 + MAX_NAME_LEN)
    + (4 + MAX_CAPABILITIES * (4 + MAX_CAPABILITY_LEN))
    + 8 + 1 + 8 + 8 + 8 + 8 + (4 + MAX_METADATA_URI_LEN) + 1;

/// Escrow PDA size: discriminator (8) + client (32) + agent (32) + amount (8)
/// + status (1) + task_id (4+64) + created_at (8) + bump (1)
const TASK_ESCROW_SIZE: usize = 8 + 32 + 32 + 8 + 1 + (4 + 64) + 8 + 1;

#[program]
pub mod agent_registry {
    use super::*;

    /// Register a new agent profile on-chain.
    pub fn register_agent(
        ctx: Context<RegisterAgent>,
        name: String,
        capabilities: Vec<String>,
        pricing_lamports: u64,
        metadata_uri: String,
    ) -> Result<()> {
        require!(name.len() <= MAX_NAME_LEN, RegistryError::NameTooLong);
        require!(
            capabilities.len() <= MAX_CAPABILITIES,
            RegistryError::TooManyCapabilities
        );
        for cap in &capabilities {
            require!(
                cap.len() <= MAX_CAPABILITY_LEN,
                RegistryError::CapabilityTooLong
            );
        }
        require!(
            metadata_uri.len() <= MAX_METADATA_URI_LEN,
            RegistryError::MetadataUriTooLong
        );
        require!(pricing_lamports > 0, RegistryError::InvalidPricing);

        let profile = &mut ctx.accounts.agent_profile;
        profile.owner = ctx.accounts.owner.key();
        profile.name = name.clone();
        profile.capabilities = capabilities.clone();
        profile.pricing_lamports = pricing_lamports;
        profile.status = AgentStatus::Active;
        profile.reputation_score = 0;
        profile.tasks_completed = 0;
        profile.total_ratings = 0;
        profile.rating_sum = 0;
        profile.metadata_uri = metadata_uri.clone();
        profile.bump = ctx.bumps.agent_profile;

        emit!(AgentRegistered {
            agent: profile.key(),
            owner: ctx.accounts.owner.key(),
            name,
            capabilities,
            pricing_lamports,
            metadata_uri,
        });

        Ok(())
    }

    /// Update an existing agent profile (owner only).
    pub fn update_agent(
        ctx: Context<UpdateAgent>,
        name: Option<String>,
        capabilities: Option<Vec<String>>,
        pricing_lamports: Option<u64>,
        metadata_uri: Option<String>,
    ) -> Result<()> {
        let profile = &mut ctx.accounts.agent_profile;

        if let Some(n) = &name {
            require!(n.len() <= MAX_NAME_LEN, RegistryError::NameTooLong);
            profile.name = n.clone();
        }

        if let Some(caps) = &capabilities {
            require!(
                caps.len() <= MAX_CAPABILITIES,
                RegistryError::TooManyCapabilities
            );
            for cap in caps {
                require!(
                    cap.len() <= MAX_CAPABILITY_LEN,
                    RegistryError::CapabilityTooLong
                );
            }
            profile.capabilities = caps.clone();
        }

        if let Some(p) = pricing_lamports {
            require!(p > 0, RegistryError::InvalidPricing);
            profile.pricing_lamports = p;
        }

        if let Some(uri) = &metadata_uri {
            require!(
                uri.len() <= MAX_METADATA_URI_LEN,
                RegistryError::MetadataUriTooLong
            );
            profile.metadata_uri = uri.clone();
        }

        emit!(AgentUpdated {
            agent: profile.key(),
            owner: ctx.accounts.owner.key(),
        });

        Ok(())
    }

    /// Deactivate an agent (owner only). Can be reactivated later.
    pub fn deactivate_agent(ctx: Context<UpdateAgent>) -> Result<()> {
        let profile = &mut ctx.accounts.agent_profile;
        profile.status = AgentStatus::Inactive;

        emit!(AgentDeactivated {
            agent: profile.key(),
            owner: ctx.accounts.owner.key(),
        });

        Ok(())
    }

    /// Reactivate a previously deactivated agent.
    pub fn activate_agent(ctx: Context<UpdateAgent>) -> Result<()> {
        let profile = &mut ctx.accounts.agent_profile;
        profile.status = AgentStatus::Active;

        emit!(AgentActivated {
            agent: profile.key(),
            owner: ctx.accounts.owner.key(),
        });

        Ok(())
    }

    /// Create a task escrow: client deposits SOL to hire an agent.
    pub fn create_task(
        ctx: Context<CreateTask>,
        task_id: String,
        amount_lamports: u64,
    ) -> Result<()> {
        require!(task_id.len() <= 64, RegistryError::TaskIdTooLong);
        require!(amount_lamports > 0, RegistryError::InvalidAmount);

        let agent_profile = &ctx.accounts.agent_profile;
        require!(
            agent_profile.status == AgentStatus::Active,
            RegistryError::AgentNotActive
        );

        // Transfer SOL from client to escrow PDA
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.client.key(),
            &ctx.accounts.task_escrow.key(),
            amount_lamports,
        );
        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.client.to_account_info(),
                ctx.accounts.task_escrow.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        let escrow = &mut ctx.accounts.task_escrow;
        escrow.client = ctx.accounts.client.key();
        escrow.agent = ctx.accounts.agent_profile.key();
        escrow.amount = amount_lamports;
        escrow.status = TaskStatus::Funded;
        escrow.task_id = task_id.clone();
        escrow.created_at = Clock::get()?.unix_timestamp;
        escrow.bump = ctx.bumps.task_escrow;

        emit!(TaskCreated {
            escrow: escrow.key(),
            client: ctx.accounts.client.key(),
            agent: ctx.accounts.agent_profile.key(),
            task_id,
            amount: amount_lamports,
        });

        Ok(())
    }

    /// Agent accepts a task.
    pub fn accept_task(ctx: Context<AgentAction>) -> Result<()> {
        let escrow = &mut ctx.accounts.task_escrow;
        require!(
            escrow.status == TaskStatus::Funded,
            RegistryError::InvalidTaskStatus
        );

        escrow.status = TaskStatus::InProgress;

        emit!(TaskAccepted {
            escrow: escrow.key(),
            agent: ctx.accounts.agent_profile.key(),
        });

        Ok(())
    }

    /// Agent completes a task; SOL released from escrow to agent owner.
    pub fn complete_task(ctx: Context<CompleteTask>) -> Result<()> {
        let escrow = &mut ctx.accounts.task_escrow;
        require!(
            escrow.status == TaskStatus::InProgress,
            RegistryError::InvalidTaskStatus
        );

        let amount = escrow.amount;
        escrow.status = TaskStatus::Completed;

        // Transfer SOL from escrow PDA to agent owner
        **escrow.to_account_info().try_borrow_mut_lamports()? -= amount;
        **ctx
            .accounts
            .agent_owner
            .to_account_info()
            .try_borrow_mut_lamports()? += amount;

        // Update agent profile stats
        let profile = &mut ctx.accounts.agent_profile;
        profile.tasks_completed += 1;

        emit!(TaskCompleted {
            escrow: escrow.key(),
            agent: ctx.accounts.agent_profile.key(),
            amount,
        });

        Ok(())
    }

    /// Client rates an agent after task completion (1-5 stars).
    pub fn rate_agent(ctx: Context<RateAgent>, rating: u8) -> Result<()> {
        require!(rating >= 1 && rating <= 5, RegistryError::InvalidRating);

        let escrow = &ctx.accounts.task_escrow;
        require!(
            escrow.status == TaskStatus::Completed,
            RegistryError::InvalidTaskStatus
        );

        let profile = &mut ctx.accounts.agent_profile;
        profile.total_ratings += 1;
        profile.rating_sum += rating as u64;
        // reputation_score = average * 100 (2 decimal precision)
        profile.reputation_score = (profile.rating_sum * 100) / profile.total_ratings;

        emit!(AgentRated {
            agent: profile.key(),
            rating,
            new_reputation: profile.reputation_score,
        });

        Ok(())
    }
}

// ─── Accounts ────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct RegisterAgent<'info> {
    #[account(
        init,
        payer = owner,
        space = AGENT_PROFILE_SIZE,
        seeds = [b"agent", owner.key().as_ref()],
        bump,
    )]
    pub agent_profile: Account<'info, AgentProfile>,

    #[account(mut)]
    pub owner: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct UpdateAgent<'info> {
    #[account(
        mut,
        seeds = [b"agent", owner.key().as_ref()],
        bump = agent_profile.bump,
        has_one = owner,
    )]
    pub agent_profile: Account<'info, AgentProfile>,

    pub owner: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(task_id: String)]
pub struct CreateTask<'info> {
    #[account(
        init,
        payer = client,
        space = TASK_ESCROW_SIZE,
        seeds = [b"escrow", client.key().as_ref(), task_id.as_bytes()],
        bump,
    )]
    pub task_escrow: Account<'info, TaskEscrow>,

    pub agent_profile: Account<'info, AgentProfile>,

    #[account(mut)]
    pub client: Signer<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct AgentAction<'info> {
    #[account(
        mut,
        constraint = task_escrow.agent == agent_profile.key() @ RegistryError::AgentMismatch,
    )]
    pub task_escrow: Account<'info, TaskEscrow>,

    /// The agent profile PDA referenced by the escrow.
    #[account(
        seeds = [b"agent", agent_owner.key().as_ref()],
        bump = agent_profile.bump,
        constraint = agent_profile.owner == agent_owner.key() @ RegistryError::Unauthorized,
    )]
    pub agent_profile: Account<'info, AgentProfile>,

    pub agent_owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct CompleteTask<'info> {
    #[account(
        mut,
        constraint = task_escrow.agent == agent_profile.key() @ RegistryError::AgentMismatch,
    )]
    pub task_escrow: Account<'info, TaskEscrow>,

    #[account(
        mut,
        seeds = [b"agent", agent_owner.key().as_ref()],
        bump = agent_profile.bump,
        constraint = agent_profile.owner == agent_owner.key() @ RegistryError::Unauthorized,
    )]
    pub agent_profile: Account<'info, AgentProfile>,

    #[account(mut)]
    pub agent_owner: Signer<'info>,
}

#[derive(Accounts)]
pub struct RateAgent<'info> {
    #[account(
        has_one = client,
    )]
    pub task_escrow: Account<'info, TaskEscrow>,

    #[account(
        mut,
        constraint = agent_profile.key() == task_escrow.agent @ RegistryError::AgentMismatch,
    )]
    pub agent_profile: Account<'info, AgentProfile>,

    pub client: Signer<'info>,
}

// ─── State ───────────────────────────────────────────────────────────

#[account]
pub struct AgentProfile {
    /// Wallet that owns/controls this agent profile.
    pub owner: Pubkey,
    /// Display name of the agent.
    pub name: String,
    /// List of capability tags (e.g., "trading", "email", "coding").
    pub capabilities: Vec<String>,
    /// Price per task in lamports.
    pub pricing_lamports: u64,
    /// Whether the agent is currently accepting tasks.
    pub status: AgentStatus,
    /// Reputation score (average rating * 100).
    pub reputation_score: u64,
    /// Number of tasks completed.
    pub tasks_completed: u64,
    /// Total number of ratings received.
    pub total_ratings: u64,
    /// Sum of all ratings (for computing average).
    pub rating_sum: u64,
    /// URI pointing to extended metadata JSON.
    pub metadata_uri: String,
    /// PDA bump seed.
    pub bump: u8,
}

#[account]
pub struct TaskEscrow {
    /// The client (human) who posted and funded the task.
    pub client: Pubkey,
    /// The agent profile PDA assigned to this task.
    pub agent: Pubkey,
    /// Amount of SOL (in lamports) escrowed.
    pub amount: u64,
    /// Current status of the task.
    pub status: TaskStatus,
    /// Unique task identifier.
    pub task_id: String,
    /// Unix timestamp when the task was created.
    pub created_at: i64,
    /// PDA bump seed.
    pub bump: u8,
}

// ─── Enums ───────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum AgentStatus {
    Active,
    Inactive,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum TaskStatus {
    Funded,
    InProgress,
    Completed,
    Disputed,
}

// ─── Events ──────────────────────────────────────────────────────────

#[event]
pub struct AgentRegistered {
    pub agent: Pubkey,
    pub owner: Pubkey,
    pub name: String,
    pub capabilities: Vec<String>,
    pub pricing_lamports: u64,
    pub metadata_uri: String,
}

#[event]
pub struct AgentUpdated {
    pub agent: Pubkey,
    pub owner: Pubkey,
}

#[event]
pub struct AgentDeactivated {
    pub agent: Pubkey,
    pub owner: Pubkey,
}

#[event]
pub struct AgentActivated {
    pub agent: Pubkey,
    pub owner: Pubkey,
}

#[event]
pub struct TaskCreated {
    pub escrow: Pubkey,
    pub client: Pubkey,
    pub agent: Pubkey,
    pub task_id: String,
    pub amount: u64,
}

#[event]
pub struct TaskAccepted {
    pub escrow: Pubkey,
    pub agent: Pubkey,
}

#[event]
pub struct TaskCompleted {
    pub escrow: Pubkey,
    pub agent: Pubkey,
    pub amount: u64,
}

#[event]
pub struct AgentRated {
    pub agent: Pubkey,
    pub rating: u8,
    pub new_reputation: u64,
}

// ─── Errors ──────────────────────────────────────────────────────────

#[error_code]
pub enum RegistryError {
    #[msg("Name exceeds maximum length of 64 characters")]
    NameTooLong,
    #[msg("Too many capabilities (max 8)")]
    TooManyCapabilities,
    #[msg("Capability name exceeds 32 characters")]
    CapabilityTooLong,
    #[msg("Metadata URI exceeds 200 characters")]
    MetadataUriTooLong,
    #[msg("Pricing must be greater than 0")]
    InvalidPricing,
    #[msg("Invalid task status for this operation")]
    InvalidTaskStatus,
    #[msg("Agent is not active")]
    AgentNotActive,
    #[msg("Amount must be greater than 0")]
    InvalidAmount,
    #[msg("Rating must be between 1 and 5")]
    InvalidRating,
    #[msg("Unauthorized: signer is not the owner")]
    Unauthorized,
    #[msg("Agent profile does not match escrow")]
    AgentMismatch,
    #[msg("Task ID exceeds 64 characters")]
    TaskIdTooLong,
}
