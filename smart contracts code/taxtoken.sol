// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// ==================== 接口 ====================
interface IERC20 {
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

interface IUniswapV2Factory {
    function createPair(address tokenA, address tokenB) external returns (address pair);
}

interface IUniswapV2Router02 {
    function factory() external pure returns (address);
    function WETH() external pure returns (address);
}

// ==================== SafeERC20 ====================
library SafeERC20 {
    function safeTransfer(IERC20 token, address to, uint256 value) internal {
        (bool ok, bytes memory data) = address(token).call(
            abi.encodeWithSelector(token.transfer.selector, to, value)
        );
        require(ok && (data.length == 0 || abi.decode(data, (bool))), "SafeERC20: transfer failed");
    }
}

// ==================== 重入保护 ====================
abstract contract ReentrancyGuard {
    uint256 private _status = 1;
    modifier nonReentrant() {
        require(_status == 1, "ReentrancyGuard: reentrant call");
        _status = 2;
        _;
        _status = 1;
    }
}

// ==================== ERC20 基础实现 ====================
abstract contract ERC20 is IERC20 {
    mapping(address => uint256) internal _balances;
    mapping(address => mapping(address => uint256)) internal _allowances;
    uint256 internal _totalSupply;
    string internal _name;
    string internal _symbol;
    uint8 internal _decimals;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) {
        _name = name_;
        _symbol = symbol_;
        _decimals = decimals_;
    }

    function name() public view virtual returns (string memory) { return _name; }
    function symbol() public view virtual returns (string memory) { return _symbol; }
    function decimals() public view virtual returns (uint8) { return _decimals; }
    function totalSupply() public view virtual override returns (uint256) { return _totalSupply; }
    function balanceOf(address account) public view virtual override returns (uint256) { return _balances[account]; }

    function transfer(address to, uint256 amount) public virtual override returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function allowance(address owner, address spender) public view virtual override returns (uint256) {
        return _allowances[owner][spender];
    }

    function approve(address spender, uint256 amount) public virtual override returns (bool) {
        _approve(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public virtual override returns (bool) {
        _spendAllowance(from, msg.sender, amount);
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal virtual {
        require(from != address(0), "ERC20: transfer from zero");
        require(to != address(0), "ERC20: transfer to zero");
        uint256 fromBalance = _balances[from];
        require(fromBalance >= amount, "ERC20: insufficient balance");
        unchecked { _balances[from] = fromBalance - amount; }
        _balances[to] += amount;
        emit Transfer(from, to, amount);
    }

    function _mint(address account, uint256 amount) internal virtual {
        require(account != address(0), "ERC20: mint to zero");
        _totalSupply += amount;
        unchecked { _balances[account] += amount; }
        emit Transfer(address(0), account, amount);
    }

    function _burn(address account, uint256 amount) internal virtual {
        require(account != address(0), "ERC20: burn from zero");
        uint256 bal = _balances[account];
        require(bal >= amount, "ERC20: burn exceeds balance");
        unchecked {
            _balances[account] = bal - amount;
            _totalSupply -= amount;
        }
        emit Transfer(account, address(0), amount);
    }

    function _approve(address owner, address spender, uint256 amount) internal virtual {
        require(owner != address(0), "ERC20: approve from zero");
        require(spender != address(0), "ERC20: approve to zero");
        _allowances[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }

    function _spendAllowance(address owner, address spender, uint256 amount) internal virtual {
        uint256 curr = _allowances[owner][spender];
        if (curr != type(uint256).max) {
            require(curr >= amount, "ERC20: insufficient allowance");
            unchecked { _approve(owner, spender, curr - amount); }
        }
    }
}

// ==================== 权限 ====================
abstract contract Ownable {
    address public owner;
    address public pendingOwner;

    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor(address initialOwner) {
        require(initialOwner != address(0), "Ownable: zero owner");
        owner = initialOwner;
        emit OwnershipTransferred(address(0), initialOwner);
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Ownable: caller not owner");
        _;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Ownable: zero new owner");
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "Ownable: not pending owner");
        address old = owner;
        owner = pendingOwner;
        pendingOwner = address(0);
        emit OwnershipTransferred(old, owner);
    }

    function renounceOwnership() external onlyOwner {
        address old = owner;
        owner = address(0);
        pendingOwner = address(0);
        emit OwnershipTransferred(old, address(0));
    }
}

// ==================== 主合约 ====================
contract SimpleTaxToken is ERC20, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 public constant FEE_DENOMINATOR = 10000;
    uint256 public constant MAX_TAX = 1000; // 10% 硬上限

    address public taxWallet;
    address public pair;
    bool public tradingEnabled;

    uint256 public buyTax;
    uint256 public sellTax;

    mapping(address => bool) public isExcludedFromFee;

    event TaxUpdated(uint256 buyTax, uint256 sellTax);
    event TaxWalletUpdated(address indexed wallet);
    event TradingEnabled();
    event ExcludedFromFeeUpdated(address indexed account, bool excluded);
    event RescuedETH(address indexed to, uint256 amount);
    event RescuedToken(address indexed token, address indexed to, uint256 amount);

    error TradingNotEnabled();
    error TaxTooHigh();
    error ZeroAddress();
    error InvalidDecimals();
    error PairCreationFailed();
    error InvalidTaxWallet();

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        uint256 totalSupply_,
        address initialOwner,
        address router_,
        address taxWallet_
    ) ERC20(name_, symbol_, decimals_) Ownable(initialOwner) {
        if (decimals_ > 18) revert InvalidDecimals();
        if (taxWallet_ == address(0)) revert ZeroAddress();
        if (router_ == address(0)) revert ZeroAddress();

        taxWallet = taxWallet_;

        address factory = IUniswapV2Router02(router_).factory();
        pair = IUniswapV2Factory(factory).createPair(
            address(this),
            IUniswapV2Router02(router_).WETH()
        );
        if (pair == address(0)) revert PairCreationFailed();

        if (taxWallet_ == address(this) || taxWallet_ == pair) revert InvalidTaxWallet();

        isExcludedFromFee[initialOwner] = true;
        isExcludedFromFee[address(this)] = true;
        isExcludedFromFee[taxWallet_] = true;

        _mint(initialOwner, totalSupply_ * (10 ** decimals_));
    }

    function setTax(uint256 buyTax_, uint256 sellTax_) external onlyOwner {
        if (buyTax_ > MAX_TAX || sellTax_ > MAX_TAX) revert TaxTooHigh();
        buyTax = buyTax_;
        sellTax = sellTax_;
        emit TaxUpdated(buyTax_, sellTax_);
    }

    function setTaxWallet(address wallet) external onlyOwner {
        if (wallet == address(0)) revert ZeroAddress();
        if (wallet == address(this) || wallet == pair) revert InvalidTaxWallet();
        taxWallet = wallet;
        emit TaxWalletUpdated(wallet);
    }

    function setExcludedFromFee(address account, bool excluded) external onlyOwner {
        isExcludedFromFee[account] = excluded;
        emit ExcludedFromFeeUpdated(account, excluded);
    }

    function enableTrading() external onlyOwner {
        require(!tradingEnabled, "Already enabled");
        tradingEnabled = true;
        emit TradingEnabled();
    }

    function _transfer(address from, address to, uint256 amount) internal override {
        // 交易开关
        if (!tradingEnabled) {
            if (
                from != owner
                    && to != owner
                    && !isExcludedFromFee[from]
                    && !isExcludedFromFee[to]
            ) revert TradingNotEnabled();
        }

        // 收税：买入（from == pair）收 buyTax，卖出（to == pair）收 sellTax
        uint256 fee = 0;
        if (
            (from == pair || to == pair)
                && !isExcludedFromFee[from]
                && !isExcludedFromFee[to]
        ) {
            if (from == pair) {
                fee = (amount * buyTax) / FEE_DENOMINATOR;
            } else {
                fee = (amount * sellTax) / FEE_DENOMINATOR;
            }
        }

        if (fee > 0) {
            super._transfer(from, taxWallet, fee);
            super._transfer(from, to, amount - fee);
        } else {
            super._transfer(from, to, amount);
        }
    }

    // ============================================================
    //                  误转资产救援（仅 owner）
    // ============================================================

    receive() external payable {}

    function rescueETH(uint256 amount) external onlyOwner nonReentrant {
        require(address(this).balance >= amount, "Insufficient ETH");
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        require(ok, "ETH rescue failed");
        emit RescuedETH(msg.sender, amount);
    }

    function rescueToken(address token, uint256 amount) external onlyOwner nonReentrant {
        if (token == address(0)) revert ZeroAddress();
        IERC20(token).safeTransfer(msg.sender, amount);
        emit RescuedToken(token, msg.sender, amount);
    }

    function rescueAllETH() external onlyOwner nonReentrant {
        uint256 bal = address(this).balance;
        require(bal > 0, "No ETH");
        (bool ok,) = payable(msg.sender).call{value: bal}("");
        require(ok, "ETH rescue failed");
        emit RescuedETH(msg.sender, bal);
    }

    function rescueAllToken(address token) external onlyOwner nonReentrant {
        if (token == address(0)) revert ZeroAddress();
        uint256 bal = IERC20(token).balanceOf(address(this));
        require(bal > 0, "No token");
        IERC20(token).safeTransfer(msg.sender, bal);
        emit RescuedToken(token, msg.sender, bal);
    }
}
