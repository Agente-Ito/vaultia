// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

// Enum imports only — importing for types, not creation bytecode
import {BudgetPolicy}           from "../policies/BudgetPolicy.sol";
import {MultiTokenBudgetPolicy} from "./policies/MultiTokenBudgetPolicy.sol";

import {BaseVaultDeployerCore} from "./BaseVaultDeployerCore.sol";
import {BaseVaultDeployer}     from "./BaseVaultDeployer.sol";

// ─── Minimal interfaces (no bytecode embedded) ────────────────────────────────

interface IOwnable {
    function transferOwnership(address newOwner) external;
}

interface IVault {
    function setPolicyEngine(address pe) external;
    function addAgent(address agent) external;
    function transferOwnership(address newOwner) external;
}

interface IPolicyEngine {
    function addPolicy(address policy) external;
    function transferOwnership(address newOwner) external;
}

interface IMerchantPolicy {
    function addMerchants(address[] calldata merchants) external;
    function transferOwnership(address newOwner) external;
}

interface IMultiTokenBudgetPolicy {
    function setBudget(address token, uint256 limit, MultiTokenBudgetPolicy.Period period) external;
    function transferOwnership(address newOwner) external;
}

interface IAgentBudgetPolicy {
    function setAgentBudget(address agent, uint256 limit) external;
    function transferOwnership(address newOwner) external;
}

/// @title BaseVaultFactory
/// @notice Factory for atomic deployment of a complete BaseAgentVault stack on Base (or any EVM chain).
///
///         All `new` calls are delegated to BaseVaultDeployer to keep this
///         contract under the 24,576-byte deployed-code limit (EIP-170).
///
///         Mirrors AgentVaultRegistry interface as closely as possible so the frontend
///         can use a unified abstraction over both LUKSO and Base vaults.
contract BaseVaultFactory is Ownable {

    // ─── Authorized callers ───────────────────────────────────────────────────

    mapping(address => bool) public authorizedCallers;
    event CallerAuthorizationChanged(address indexed caller, bool authorized);

    function setAuthorizedCaller(address caller, bool authorized) external onlyOwner {
        require(caller != address(0), "BVF: zero caller");
        authorizedCallers[caller] = authorized;
        emit CallerAuthorizationChanged(caller, authorized);
    }

    // ─── Storage ──────────────────────────────────────────────────────────────

    address public immutable entryPoint;
    BaseVaultDeployerCore public immutable core;
    BaseVaultDeployer     public immutable deployer;

    struct VaultRecord {
        address vault;
        address policyEngine;
        string  label;
        address token;
    }

    mapping(address => VaultRecord[]) private _ownerVaults;
    mapping(address => address) public vaultToPolicyEngine;

    event VaultDeployed(
        address indexed owner,
        address indexed vault,
        address indexed policyEngine,
        string  label,
        address token,
        uint256 chainId
    );

    // ─── Deploy parameters ────────────────────────────────────────────────────

    struct DeployParams {
        string  label;
        address token;
        uint256 budget;
        BudgetPolicy.Period period;
        TokenBudgetEntry[] tokenBudgets;
        uint256   expiration;
        address[] agents;
        uint256[] agentBudgets;
        address[] merchants;
    }

    struct TokenBudgetEntry {
        address token;
        uint256 limit;
        MultiTokenBudgetPolicy.Period period;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address _entryPoint, address _core, address _deployer) Ownable() {
        require(_entryPoint != address(0), "BVF: zero entryPoint");
        require(_core       != address(0), "BVF: zero core");
        require(_deployer   != address(0), "BVF: zero deployer");
        entryPoint = _entryPoint;
        core       = BaseVaultDeployerCore(_core);
        deployer   = BaseVaultDeployer(_deployer);
    }

    // ─── Public deployment ────────────────────────────────────────────────────

    function deployVault(DeployParams calldata p) external returns (VaultRecord memory) {
        return _deploy(msg.sender, p);
    }

    function deployVaultOnBehalf(address owner, DeployParams calldata p)
        external returns (VaultRecord memory)
    {
        require(authorizedCallers[msg.sender], "BVF: caller not authorized");
        require(owner != address(0), "BVF: zero owner");
        return _deploy(owner, p);
    }

    // ─── Internal deployment logic ────────────────────────────────────────────

    function _deploy(address owner, DeployParams calldata p)
        internal
        returns (VaultRecord memory record)
    {
        require(p.agents.length <= 20, "BVF: too many agents");
        require(
            p.agentBudgets.length == 0 || p.agentBudgets.length == p.agents.length,
            "BVF: agentBudgets length mismatch"
        );
        bool singleToken = p.budget > 0;
        bool multiToken  = p.tokenBudgets.length > 0;
        require(singleToken != multiToken, "BVF: specify either budget or tokenBudgets");

        address vault = core.newVault(address(this), entryPoint);
        address pe    = core.newPolicyEngine(address(this), vault);

        address primaryToken;
        if (singleToken) {
            address bp = core.newBudgetPolicy(address(this), pe, p.budget, p.period, p.token);
            IPolicyEngine(pe).addPolicy(bp);
            IOwnable(bp).transferOwnership(owner);
            primaryToken = p.token;
        } else {
            address mtbp = core.newMultiTokenBudgetPolicy(address(this), pe);
            for (uint256 i = 0; i < p.tokenBudgets.length; i++) {
                IMultiTokenBudgetPolicy(mtbp).setBudget(
                    p.tokenBudgets[i].token,
                    p.tokenBudgets[i].limit,
                    p.tokenBudgets[i].period
                );
            }
            IPolicyEngine(pe).addPolicy(mtbp);
            IMultiTokenBudgetPolicy(mtbp).transferOwnership(owner);
            primaryToken = address(0);
        }

        if (p.merchants.length > 0) {
            require(p.merchants.length <= 100, "BVF: too many merchants");
            address mp = deployer.newMerchantPolicy(address(this), pe);
            IMerchantPolicy(mp).addMerchants(p.merchants);
            IPolicyEngine(pe).addPolicy(mp);
            IMerchantPolicy(mp).transferOwnership(owner);
        }

        if (p.expiration > 0) {
            require(p.expiration > block.timestamp, "BVF: expiration in the past");
            address ep = deployer.newExpirationPolicy(address(this), pe, p.expiration);
            IPolicyEngine(pe).addPolicy(ep);
            IOwnable(ep).transferOwnership(owner);
        }

        if (p.agentBudgets.length > 0) {
            address abp = deployer.newAgentBudgetPolicy(
                address(this), pe,
                p.period,
                singleToken ? p.token : address(0)
            );
            for (uint256 i = 0; i < p.agents.length; i++) {
                IAgentBudgetPolicy(abp).setAgentBudget(p.agents[i], p.agentBudgets[i]);
            }
            IPolicyEngine(pe).addPolicy(abp);
            IAgentBudgetPolicy(abp).transferOwnership(owner);
        }

        IVault(vault).setPolicyEngine(pe);
        for (uint256 i = 0; i < p.agents.length; i++) {
            require(p.agents[i] != address(0), "BVF: zero agent");
            IVault(vault).addAgent(p.agents[i]);
        }

        IVault(vault).transferOwnership(owner);
        IPolicyEngine(pe).transferOwnership(owner);

        record = VaultRecord(vault, pe, p.label, primaryToken);
        _ownerVaults[owner].push(record);
        vaultToPolicyEngine[vault] = pe;

        emit VaultDeployed(owner, vault, pe, p.label, primaryToken, block.chainid);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function getVaults(address owner) external view returns (VaultRecord[] memory) {
        return _ownerVaults[owner];
    }

    function getPolicyEngine(address vault) external view returns (address) {
        return vaultToPolicyEngine[vault];
    }
}
