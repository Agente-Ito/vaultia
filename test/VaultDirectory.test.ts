import { expect } from "chai";
import { ethers } from "hardhat";
import { VaultDirectory } from "../typechain-types";

describe("VaultDirectory", () => {
  let directory: VaultDirectory;
  let owner: any;
  let vault1: any;
  let vault2: any;

  beforeEach(async () => {
    [owner, vault1, vault2] = await ethers.getSigners();

    const VaultDirectory = await ethers.getContractFactory("VaultDirectory");
    directory = await VaultDirectory.deploy();
  });

  describe("Vault Registration", () => {
    it("should register a vault with metadata", async () => {
      const linkedPool = ethers.id("TestPool");

      await directory.registerVault(
        vault1.address,
        "Groceries",
        linkedPool
      );

      const vault = await directory.getVault(vault1.address);
      expect(vault.label).to.equal("Groceries");
      expect(vault.linkedPool).to.equal(linkedPool);
      expect(vault.registered).to.be.true;
    });

    it("should prevent duplicate registration", async () => {
      await directory.registerVault(vault1.address, "Groceries", ethers.ZeroHash);

      await expect(
        directory.registerVault(vault1.address, "Groceries", ethers.ZeroHash)
      ).to.be.revertedWith("VD: vault already registered");
    });

    it("should validate label length", async () => {
      const tooLongLabel = "a".repeat(129); // > 128 chars

      await expect(
        directory.registerVault(vault1.address, tooLongLabel, ethers.ZeroHash)
      ).to.be.revertedWith("VD: invalid label");
    });

    it("should track multiple vaults", async () => {
      await directory.registerVault(vault1.address, "Groceries", ethers.ZeroHash);
      await directory.registerVault(vault2.address, "Utilities", ethers.ZeroHash);

      const count = await directory.getVaultCount();
      expect(count).to.equal(2);
    });
  });

  describe("Vault Updates", () => {
    beforeEach(async () => {
      await directory.registerVault(
        vault1.address,
        "Groceries",
        ethers.ZeroHash
      );
    });

    it("should update vault label", async () => {
      await directory.updateVaultLabel(vault1.address, "Updated Groceries");

      const label = await directory.getVaultLabel(vault1.address);
      expect(label).to.equal("Updated Groceries");
    });

    it("should update linked pool", async () => {
      const newPool = ethers.id("NewPool");
      await directory.updatePoolLink(vault1.address, newPool);

      const pool = await directory.getVaultPool(vault1.address);
      expect(pool).to.equal(newPool);
    });

    it("should prevent update of unregistered vault", async () => {
      await expect(
        directory.updateVaultLabel(vault2.address, "New Label")
      ).to.be.revertedWith("VD: vault not registered");
    });
  });

  describe("Vault Removal", () => {
    beforeEach(async () => {
      await directory.registerVault(vault1.address, "Groceries", ethers.ZeroHash);
      await directory.registerVault(vault2.address, "Utilities", ethers.ZeroHash);
    });

    it("should unregister a vault", async () => {
      await directory.unregisterVault(vault1.address);

      expect(await directory.isVaultRegistered(vault1.address)).to.be.false;
    });

    it("should update count after unregistration", async () => {
      const countBefore = await directory.getVaultCount();
      await directory.unregisterVault(vault1.address);
      const countAfter = await directory.getVaultCount();

      expect(countBefore).to.equal(2);
      expect(countAfter).to.equal(1);
    });

    it("should allow re-registration after removal", async () => {
      await directory.unregisterVault(vault1.address);
      await directory.registerVault(
        vault1.address,
        "Groceries Updated",
        ethers.ZeroHash
      );

      expect(await directory.isVaultRegistered(vault1.address)).to.be.true;
      const label = await directory.getVaultLabel(vault1.address);
      expect(label).to.equal("Groceries Updated");
    });
  });

  describe("View Functions", () => {
    beforeEach(async () => {
      await directory.registerVault(vault1.address, "Groceries", ethers.id("Pool1"));
      await directory.registerVault(vault2.address, "Utilities", ethers.id("Pool2"));
    });

    it("should get paginated vaults", async () => {
      const vaults = await directory.getVaults(0, 10);
      expect(vaults).to.include(vault1.address);
      expect(vaults).to.include(vault2.address);
    });

    it("should get all vaults", async () => {
      const allVaults = await directory.getAllVaults();
      expect(allVaults.length).to.equal(2);
      expect(allVaults).to.include(vault1.address);
      expect(allVaults).to.include(vault2.address);
    });

    it("should check vault registration", async () => {
      expect(await directory.isVaultRegistered(vault1.address)).to.be.true;

      const unregistered = owner.address;
      expect(await directory.isVaultRegistered(unregistered)).to.be.false;
    });

    it("should handle pagination edge cases", async () => {
      // Offset at edge (= length) should fail
      await expect(
        directory.getVaults(2, 10)
      ).to.be.revertedWith("VD: invalid offset");

      // Offset within bounds with limit larger than remaining
      const vaults = await directory.getVaults(0, 10);
      expect(vaults.length).to.equal(2);

      // Offset 0 limit 1
      const oneVault = await directory.getVaults(0, 1);
      expect(oneVault.length).to.equal(1);
    });
  });

  describe("Authorization", () => {
    it("should only allow owner to register", async () => {
      const directoryAway = directory.connect(vault1);

      await expect(
        directoryAway.registerVault(vault2.address, "Test", ethers.ZeroHash)
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("should only allow owner to update", async () => {
      await directory.registerVault(vault1.address, "Groceries", ethers.ZeroHash);

      const directoryAway = directory.connect(vault1);
      await expect(
        directoryAway.updateVaultLabel(vault1.address, "New")
      ).to.be.revertedWith("Ownable: caller is not the owner");
    });
  });
});
