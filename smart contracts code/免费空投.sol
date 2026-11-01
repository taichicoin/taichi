// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

interface IERC721 {
    function balanceOf(address owner) external view returns (uint256);
}

/**
 * @title NFTHolderAirdrop
 * @notice 持有指定 NFT 的地址，每人可领取 10000 枚 ERC20 代币，领完即止。
 */
contract NFTHolderAirdrop {
    // ==================== 固定配置（编译期常量）====================
    /// @notice 空投代币地址（BSC 主网，已修正 checksum）
    address public constant TOKEN_ADDRESS = 0x5342022FB61cBBcc31E147C7080Df71AbA70Da8D;
    /// @notice 白名单 NFT 地址（BSC 主网，不可转让）
    address public constant NFT_ADDRESS = 0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F;
    /// @notice 每人领取数量：10000 枚（精度 18）
    uint256 public constant AMOUNT_PER_CLAIM = 10_000 * 1e18;

    // ==================== 状态变量 ====================
    address public owner;
    mapping(address => bool) public hasClaimed;
    uint256 public totalClaimed;

    // ==================== 事件 ====================
    event Claimed(address indexed account, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor() {
        require(TOKEN_ADDRESS.code.length > 0, "token not contract");
        require(NFT_ADDRESS.code.length > 0, "nft not contract");
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    function claim() external {
        require(!hasClaimed[msg.sender], "Already claimed");
        require(IERC721(NFT_ADDRESS).balanceOf(msg.sender) > 0, "Not an NFT holder");

        uint256 bal = IERC20(TOKEN_ADDRESS).balanceOf(address(this));
        require(bal >= AMOUNT_PER_CLAIM, "Airdrop exhausted");

        hasClaimed[msg.sender] = true;
        totalClaimed += AMOUNT_PER_CLAIM;

        _safeTransfer(TOKEN_ADDRESS, msg.sender, AMOUNT_PER_CLAIM);

        emit Claimed(msg.sender, AMOUNT_PER_CLAIM);
    }

    function remainingClaims() external view returns (uint256) {
        return IERC20(TOKEN_ADDRESS).balanceOf(address(this)) / AMOUNT_PER_CLAIM;
    }

    function poolBalance() external view returns (uint256) {
        return IERC20(TOKEN_ADDRESS).balanceOf(address(this));
    }

    function withdraw(address to) external onlyOwner {
        require(to != address(0), "to is zero");
        uint256 bal = IERC20(TOKEN_ADDRESS).balanceOf(address(this));
        require(bal > 0, "nothing to withdraw");
        _safeTransfer(TOKEN_ADDRESS, to, bal);
        emit Withdrawn(to, bal);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "new owner is zero");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    function _safeTransfer(address t, address to, uint256 amount) internal {
        (bool ok, bytes memory data) = t.call(
            abi.encodeWithSelector(IERC20.transfer.selector, to, amount)
        );
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "transfer failed");
    }
}
