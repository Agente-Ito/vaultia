// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title AgentCoordinator
/// @notice Manages agent roles, capabilities, and metadata for the AI Financial OS.
/// Supports both EOAs and smart contract agents with fine-grained permission control.
contract AgentCoordinator is Ownable {

    /// @dev Predefined capability identifiers (expandable)
    bytes32 public constant CAN_PAY = keccak256("CAN_PAY");
    bytes32 public constant CAN_TRADE = keccak256("CAN_TRADE");
    bytes32 public constant CAN_REBALANCE = keccak256("CAN_REBALANCE");
    bytes32 public constant CAN_SUBSCRIBE = keccak256("CAN_SUBSCRIBE");
    bytes32 public constant CAN_TRANSFER = keccak256("CAN_TRANSFER");
    bytes32 public constant CAN_YIELD = keccak256("CAN_YIELD");

    struct AgentConfig {
        bool isContract;           // true if agent.code.length > 0 at registration
        uint256 maxGasPerCall;     // 0 for EOAs; >0 for contract agents
        bool allowedAutomation;    // Can this agent be scheduled in TaskScheduler?
    }

    /// @notice Agent address → configuration
    mapping(address => AgentConfig) public agents;

    /// @notice Tracks which agents have been explicitly registered.
    ///         Needed because AgentConfig defaults to all-zero, making
    ///         unregistered addresses indistinguishable from registered EOAs otherwise.
    mapping(address => bool) public isAgentRegistered;

    /// @notice Role name (bytes32) → list of capabilities in that role
    mapping(bytes32 => bytes32[]) public roleCapabilities;

    /// @notice Role name (bytes32) → agents assigned to this role
    mapping(bytes32 => address[]) public roleMembers;

    /// @notice Agent → assigned roles
    mapping(address => bytes32[]) public agentRoles;

    /// @notice Agent + Capability → has this capability
    mapping(address => mapping(bytes32 => bool)) public hasCapability;

    /// @notice Role admin (default: owner, can be changed)
    address public roleAdmin;

    // ═════════════════════════════════════════════════════════════════════
    // EVENTS
    // ═════════════════════════════════════════════════════════════════════

    event AgentRegistered(
        address indexed agent,
        bool isContract,
        uint256 maxGasPerCall,
        bool allowedAutomation
    );

    event RoleDefinedForAgent(
        address indexed agent,
        bytes32 indexed role,
        bytes32[] capabilities
    );

    event RoleRevoked(address indexed agent, bytes32 indexed role);

    event CapabilityGranted(address indexed agent, bytes32 indexed capability);

    event CapabilityRevoked(address indexed agent, bytes32 indexed capability);

    event RoleAdminChanged(address indexed oldAdmin, address indexed newAdmin);

    // ═════════════════════════════════════════════════════════════════════
    // INITIALIZATION
    // ═════════════════════════════════════════════════════════════════════

    constructor() {
        roleAdmin = msg.sender;
    }

    // ═════════════════════════════════════════════════════════════════════
    // ROLE ADMIN MANAGEMENT
    // ═════════════════════════════════════════════════════════════════════

    modifier onlyRoleAdmin() {
        require(msg.sender == roleAdmin, "AC: only roleAdmin");
        _;
    }

    function setRoleAdmin(address newAdmin) external onlyOwner {
        require(newAdmin != address(0), "AC: invalid admin");
        address oldAdmin = roleAdmin;
        roleAdmin = newAdmin;
        emit RoleAdminChanged(oldAdmin, newAdmin);
    }

    // ═════════════════════════════════════════════════════════════════════
    // AGENT REGISTRATION
    // ═════════════════════════════════════════════════════════════════════

    /// @notice Register an agent (EOA or contract) with optional gas limits
    /// @param agent Address of the agent (EOA or contract)
    /// @param maxGasPerCall Max gas per transaction (0 for EOAs, >0 for contracts)
    /// @param allowedAutomation Can this agent be used in TaskScheduler?
    function registerAgent(
        address agent,
        uint256 maxGasPerCall,
        bool allowedAutomation
    ) external onlyRoleAdmin {
        require(agent != address(0), "AC: invalid agent");
        require(!isAgentRegistered[agent], "AC: already registered");

        // Auto-detect contract vs EOA
        bool isContract = agent.code.length > 0;

        agents[agent] = AgentConfig({
            isContract: isContract,
            maxGasPerCall: maxGasPerCall,
            allowedAutomation: allowedAutomation
        });
        isAgentRegistered[agent] = true;

        emit AgentRegistered(agent, isContract, maxGasPerCall, allowedAutomation);
    }

    /// @notice Update max gas limit for an existing agent
    function setMaxGasPerCall(address agent, uint256 newLimit)
        external
        onlyRoleAdmin
    {
        require(isAgentRegistered[agent], "AC: agent not registered");
        agents[agent].maxGasPerCall = newLimit;
    }

    /// @notice Enable/disable automation for an agent
    function setAllowedAutomation(address agent, bool allowed)
        external
        onlyRoleAdmin
    {
        agents[agent].allowedAutomation = allowed;
    }

    // ═════════════════════════════════════════════════════════════════════
    // ROLE MANAGEMENT
    // ═════════════════════════════════════════════════════════════════════

    /// @notice Assign a role to an agent, optionally with custom capabilities
    /// @param agent Agent to assign role to
    /// @param role Role identifier (bytes32)
    /// @param capabilities Optional custom capabilities for this assignment
    function assignRole(
        address agent,
        bytes32 role,
        bytes32[] calldata capabilities
    ) external onlyRoleAdmin {
        require(agent != address(0), "AC: invalid agent");
        require(role != bytes32(0), "AC: invalid role");
        require(isAgentRegistered[agent], "AC: agent not registered");

        // Add role to agent's role list if not already present
        bool alreadyHasRole = false;
        for (uint i = 0; i < agentRoles[agent].length; i++) {
            if (agentRoles[agent][i] == role) {
                alreadyHasRole = true;
                break;
            }
        }
        if (!alreadyHasRole) {
            agentRoles[agent].push(role);
        }

        // Grant capabilities
        if (capabilities.length > 0) {
            for (uint i = 0; i < capabilities.length; i++) {
                bytes32 cap = capabilities[i];
                if (!hasCapability[agent][cap]) {
                    hasCapability[agent][cap] = true;
                    emit CapabilityGranted(agent, cap);
                }
            }
            // Store role's capabilities for reference
            roleCapabilities[role] = capabilities;
        }

        // Add agent to role's member list
        bool isMember = false;
        for (uint i = 0; i < roleMembers[role].length; i++) {
            if (roleMembers[role][i] == agent) {
                isMember = true;
                break;
            }
        }
        if (!isMember) {
            roleMembers[role].push(agent);
        }

        emit RoleDefinedForAgent(agent, role, capabilities);
    }

    /// @notice Revoke a role from an agent
    function revokeRole(address agent, bytes32 role)
        external
        onlyRoleAdmin
    {
        require(agent != address(0), "AC: invalid agent");
        require(role != bytes32(0), "AC: invalid role");

        // Remove role from agent's role list
        for (uint i = 0; i < agentRoles[agent].length; i++) {
            if (agentRoles[agent][i] == role) {
                agentRoles[agent][i] = agentRoles[agent][agentRoles[agent].length - 1];
                agentRoles[agent].pop();
                break;
            }
        }

        // Remove agent from role's member list
        for (uint i = 0; i < roleMembers[role].length; i++) {
            if (roleMembers[role][i] == agent) {
                roleMembers[role][i] = roleMembers[role][roleMembers[role].length - 1];
                roleMembers[role].pop();
                break;
            }
        }

        emit RoleRevoked(agent, role);
    }

    // ═════════════════════════════════════════════════════════════════════
    // CAPABILITY MANAGEMENT
    // ═════════════════════════════════════════════════════════════════════

    /// @notice Grant a specific capability to an agent
    function grantCapability(address agent, bytes32 capability)
        external
        onlyRoleAdmin
    {
        require(agent != address(0), "AC: invalid agent");
        require(capability != bytes32(0), "AC: invalid capability");
        require(isAgentRegistered[agent], "AC: agent not registered");

        if (!hasCapability[agent][capability]) {
            hasCapability[agent][capability] = true;
            emit CapabilityGranted(agent, capability);
        }
    }

    /// @notice Revoke a specific capability from an agent
    function revokeCapability(address agent, bytes32 capability)
        external
        onlyRoleAdmin
    {
        require(agent != address(0), "AC: invalid agent");
        require(capability != bytes32(0), "AC: invalid capability");

        if (hasCapability[agent][capability]) {
            hasCapability[agent][capability] = false;
            emit CapabilityRevoked(agent, capability);
        }
    }

    // ═════════════════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═════════════════════════════════════════════════════════════════════

    /// @notice Check if agent has a specific role
    function hasRole(address agent, bytes32 role)
        external
        view
        returns (bool)
    {
        for (uint i = 0; i < agentRoles[agent].length; i++) {
            if (agentRoles[agent][i] == role) {
                return true;
            }
        }
        return false;
    }

    /// @notice Get all roles for an agent
    function getAgentRoles(address agent)
        external
        view
        returns (bytes32[] memory)
    {
        return agentRoles[agent];
    }

    /// @notice Get all capabilities for a role
    function getCapabilitiesForRole(bytes32 role)
        external
        view
        returns (bytes32[] memory)
    {
        return roleCapabilities[role];
    }

    /// @notice Get all members of a role
    function getRoleMembers(bytes32 role)
        external
        view
        returns (address[] memory)
    {
        return roleMembers[role];
    }

    /// @notice Get agent configuration
    function getAgentConfig(address agent)
        external
        view
        returns (AgentConfig memory)
    {
        return agents[agent];
    }

    /// @notice Check if agent is a contract
    function isContractAgent(address agent) external view returns (bool) {
        return agents[agent].isContract;
    }

    /// @notice Get max gas per call for contract agent
    function getMaxGasPerCall(address agent) external view returns (uint256) {
        return agents[agent].maxGasPerCall;
    }

    /// @notice Check if agent can be automated
    function canBeAutomated(address agent) external view returns (bool) {
        return agents[agent].allowedAutomation;
    }
}
