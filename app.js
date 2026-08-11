// app.js

// Fixed list of 10 office members
const MEMBERS = [
    "Renny", "Sheeja", "Libin", "rajesh", "avinash",
    "Makesh 1", "Mahesh 2", "Vignesh", "Shreenivas", "Sarath"
];
const CONTRIBUTION_AMOUNT = 500;
const INTEREST_RATE = 0.10; // 10%

// Initial Data Structure
const getInitialData = () => ({
    contributions: {}, // Format: { "YYYY-MM": ["Member1", "Member2"] }
    loans: [] // Format: { id, borrower, amount, interest, totalDue, issueDate, deadline, status: 'active'|'closed', repayments: [{id, date, amount}] }
});

// Load data from localStorage
let appData = JSON.parse(localStorage.getItem('officeFundData')) || getInitialData();

// Backwards compatibility for older data without repayments array
appData.loans.forEach(loan => {
    if (!loan.repayments) {
        loan.repayments = [];
        // If it was already closed before we added this feature, create a dummy repayment so the math works out
        if (loan.status === 'closed') {
            loan.repayments.push({
                id: 'legacy-' + loan.id,
                date: loan.deadline, // just use deadline as date
                amount: loan.totalDue
            });
        }
    }
});

// Save data to localStorage
const saveData = () => {
    localStorage.setItem('officeFundData', JSON.stringify(appData));
    updateDashboard();
};

// DOM Elements
const els = {
    totalCollected: document.getElementById('totalCollected'),
    availableBalance: document.getElementById('availableBalance'),
    totalLent: document.getElementById('totalLent'),
    totalInterest: document.getElementById('totalInterest'),
    contributionMonth: document.getElementById('contributionMonth'),
    membersList: document.getElementById('membersList'),
    borrowerSelect: document.getElementById('borrower'),
    borrowForm: document.getElementById('borrowForm'),
    borrowAmount: document.getElementById('borrowAmount'),
    borrowDate: document.getElementById('borrowDate'),
    borrowError: document.getElementById('borrowError'),
    loansTableBody: document.getElementById('loansTableBody'),
    noLoansMessage: document.getElementById('noLoansMessage'),
    repaymentsTableBody: document.getElementById('repaymentsTableBody'),
    noRepaymentsMessage: document.getElementById('noRepaymentsMessage')
};

// Initialize Application
const init = () => {
    // Set current month for contribution
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    els.contributionMonth.value = `${yyyy}-${mm}`;
    
    // Set today for borrow date
    const dd = String(today.getDate()).padStart(2, '0');
    els.borrowDate.value = `${yyyy}-${mm}-${dd}`;

    populateBorrowerSelect();
    renderContributionList();
    renderLoansTable();
    renderRepaymentReport();
    updateDashboard();

    // Event Listeners
    els.contributionMonth.addEventListener('change', renderContributionList);
    els.borrowForm.addEventListener('submit', handleBorrow);
};

// Dashboard Calculations
const updateDashboard = () => {
    let totalContributions = 0;
    for (const month in appData.contributions) {
        totalContributions += appData.contributions[month].length * CONTRIBUTION_AMOUNT;
    }

    let activeLent = 0;
    let earnedInterest = 0;
    let totalPrincipals = 0;
    let totalRepayments = 0;

    appData.loans.forEach(loan => {
        const repaidSoFar = loan.repayments.reduce((sum, r) => sum + r.amount, 0);
        totalPrincipals += loan.amount;
        totalRepayments += repaidSoFar;

        if (loan.status === 'active') {
            activeLent += loan.amount; // currently active principal lent out
        } else if (loan.status === 'closed') {
            earnedInterest += loan.interest; // only count as earned when fully closed
        }
    });

    const availableBalance = totalContributions - totalPrincipals + totalRepayments;

    // Update DOM
    els.totalCollected.textContent = `₹${totalContributions.toLocaleString()}`;
    els.availableBalance.textContent = `₹${availableBalance.toLocaleString()}`;
    els.totalLent.textContent = `₹${activeLent.toLocaleString()}`;
    els.totalInterest.textContent = `₹${earnedInterest.toLocaleString()}`;
};

// Populate Members Dropdown
const populateBorrowerSelect = () => {
    MEMBERS.forEach(member => {
        const option = document.createElement('option');
        option.value = member;
        option.textContent = member;
        els.borrowerSelect.appendChild(option);
    });
};

// Render Contribution List
const renderContributionList = () => {
    const selectedMonth = els.contributionMonth.value;
    if (!selectedMonth) return;

    if (!appData.contributions[selectedMonth]) {
        appData.contributions[selectedMonth] = [];
    }

    const paidMembers = appData.contributions[selectedMonth];
    els.membersList.innerHTML = '';

    MEMBERS.forEach(member => {
        const isPaid = paidMembers.includes(member);
        
        const tr = document.createElement('tr');
        tr.className = 'text-sm border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors';
        
        tr.innerHTML = `
            <td class="py-3 pl-2 whitespace-nowrap">
                <span class="font-medium ${isPaid ? 'text-gray-900' : 'text-gray-600'}">${member}</span>
            </td>
            <td class="py-3 whitespace-nowrap text-center">
                <input type="checkbox" class="member-checkbox mx-auto" data-member="${member}" ${isPaid ? 'checked' : ''}>
            </td>
            <td class="py-3 whitespace-nowrap text-right pr-4">
                <span class="font-bold ${isPaid ? 'text-green-600' : 'text-gray-400'}">
                    ${isPaid ? '₹' + CONTRIBUTION_AMOUNT.toLocaleString() : '₹0'}
                </span>
            </td>
        `;

        const checkbox = tr.querySelector('input');
        checkbox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            toggleContribution(member, selectedMonth, isChecked);
            
            // Update row UI instantly without losing focus
            const nameSpan = tr.querySelector('td:first-child span');
            const amountSpan = tr.querySelector('td:last-child span');
            
            if (isChecked) {
                nameSpan.className = 'font-medium text-gray-900';
                amountSpan.className = 'font-bold text-green-600';
                amountSpan.textContent = '₹' + CONTRIBUTION_AMOUNT.toLocaleString();
            } else {
                nameSpan.className = 'font-medium text-gray-600';
                amountSpan.className = 'font-bold text-gray-400';
                amountSpan.textContent = '₹0';
            }
        });
        
        els.membersList.appendChild(tr);
    });
};

// Toggle Contribution
const toggleContribution = (member, month, isPaid) => {
    let paidMembers = appData.contributions[month];
    
    if (isPaid) {
        if (!paidMembers.includes(member)) paidMembers.push(member);
    } else {
        appData.contributions[month] = paidMembers.filter(m => m !== member);
    }
    
    saveData();
};

// Calculate Available Balance Helper (for form validation)
const getAvailableBalance = () => {
    let totalContributions = Object.values(appData.contributions).reduce((acc, monthArray) => acc + (monthArray.length * CONTRIBUTION_AMOUNT), 0);
    let totalPrincipals = appData.loans.reduce((acc, l) => acc + l.amount, 0);
    let totalRepayments = appData.loans.reduce((acc, l) => acc + l.repayments.reduce((sum, r) => sum + r.amount, 0), 0);
    return totalContributions - totalPrincipals + totalRepayments;
};

// Handle Borrowing
const handleBorrow = (e) => {
    e.preventDefault();
    els.borrowError.classList.add('hidden');

    const borrower = els.borrowerSelect.value;
    const amount = parseFloat(els.borrowAmount.value);
    const issueDate = els.borrowDate.value;

    if (!borrower || isNaN(amount) || amount <= 0 || !issueDate) {
        showError("Please fill all fields correctly.");
        return;
    }

    const available = getAvailableBalance();
    if (amount > available) {
        showError(`Requested amount exceeds available balance (₹${available.toLocaleString()}).`);
        return;
    }

    // Calculate Interest and Deadline
    const interest = amount * INTEREST_RATE;
    const totalDue = amount + interest;
    
    const dateObj = new Date(issueDate);
    dateObj.setMonth(dateObj.getMonth() + 3); // 3 months deadline
    const deadlineStr = dateObj.toISOString().split('T')[0];

    const newLoan = {
        id: Date.now().toString(),
        borrower,
        amount,
        interest,
        totalDue,
        issueDate,
        deadline: deadlineStr,
        status: 'active',
        repayments: []
    };

    appData.loans.unshift(newLoan);
    saveData();
    
    // Reset Form
    els.borrowForm.reset();
    els.borrowDate.value = issueDate; // Keep date
    
    renderLoansTable();
};

const showError = (msg) => {
    els.borrowError.textContent = msg;
    els.borrowError.classList.remove('hidden');
};

// Render Loans Table
const renderLoansTable = () => {
    els.loansTableBody.innerHTML = '';
    
    if (appData.loans.length === 0) {
        els.noLoansMessage.classList.remove('hidden');
    } else {
        els.noLoansMessage.classList.add('hidden');
        
        appData.loans.forEach(loan => {
            const repaidSoFar = loan.repayments.reduce((sum, r) => sum + r.amount, 0);
            const remainingDue = loan.totalDue - repaidSoFar;
            
            const tr = document.createElement('tr');
            tr.className = 'text-sm border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors';
            
            const isActive = loan.status === 'active';
            const statusDot = isActive ? 'bg-green-500' : 'bg-gray-400';
            
            // Format Dates
            const issueD = new Date(loan.issueDate).toLocaleDateString('en-GB', {day: '2-digit', month: 'short', year: '2-digit'});
            const deadD = new Date(loan.deadline).toLocaleDateString('en-GB', {day: '2-digit', month: 'short', year: '2-digit'});

            tr.innerHTML = `
                <td class="py-3 pl-2 whitespace-nowrap">
                    <div class="flex items-center gap-2">
                        <span class="w-1.5 h-1.5 rounded-full ${statusDot}"></span>
                        <span class="font-medium text-gray-900">${loan.borrower}</span>
                    </div>
                </td>
                <td class="py-3 whitespace-nowrap text-gray-700">₹${loan.amount.toLocaleString()}</td>
                <td class="py-3 whitespace-nowrap text-indigo-600 font-medium">+₹${loan.interest.toLocaleString()}</td>
                <td class="py-3 whitespace-nowrap font-bold text-gray-900">₹${remainingDue.toLocaleString()}</td>
                <td class="py-3 whitespace-nowrap text-xs text-gray-500">
                    <div>Out: ${issueD}</div>
                    <div>Due: ${deadD}</div>
                </td>
                <td class="py-3 pr-2 text-right whitespace-nowrap">
                    ${isActive ? 
                        `<button onclick="repayInstallment('${loan.id}')" class="bg-white border border-green-200 text-green-700 hover:bg-green-50 px-3 py-1.5 rounded-md text-xs font-semibold shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-green-500/50">Pay</button>` 
                        : 
                        `<span class="text-xs font-semibold text-gray-400 uppercase">Settled</span>`
                    }
                </td>
            `;
            els.loansTableBody.appendChild(tr);
        });
    }
};

// Global function for Installment Repayment
window.repayInstallment = (id) => {
    const loan = appData.loans.find(l => l.id === id);
    if (!loan || loan.status !== 'active') return;

    const repaidSoFar = loan.repayments.reduce((sum, r) => sum + r.amount, 0);
    const remainingDue = loan.totalDue - repaidSoFar;

    const input = prompt(`Repaying loan for ${loan.borrower}.\nRemaining Due: ₹${remainingDue.toLocaleString()}\nEnter amount to repay today:`, remainingDue);
    
    if (input === null) return; // User cancelled
    
    const amount = parseFloat(input);
    
    if (isNaN(amount) || amount <= 0) {
        alert("Please enter a valid positive amount.");
        return;
    }
    
    if (amount > remainingDue) {
        alert(`You cannot repay more than the remaining due (₹${remainingDue.toLocaleString()}).`);
        return;
    }

    // Add repayment record
    const today = new Date().toISOString().split('T')[0];
    loan.repayments.push({
        id: Date.now().toString(),
        date: today,
        amount: amount
    });

    // Check if fully paid
    const newRepaidSoFar = loan.repayments.reduce((sum, r) => sum + r.amount, 0);
    if (newRepaidSoFar >= loan.totalDue) {
        loan.status = 'closed';
        alert(`Loan fully settled for ${loan.borrower}!`);
    } else {
        alert(`Successfully recorded partial repayment of ₹${amount.toLocaleString()} for ${loan.borrower}.`);
    }

    saveData();
    renderLoansTable();
    renderRepaymentReport();
};

// Render Repayment Report
const renderRepaymentReport = () => {
    els.repaymentsTableBody.innerHTML = '';
    
    // Extract all repayments into a flat array with loan context
    let allRepayments = [];
    appData.loans.forEach(loan => {
        loan.repayments.forEach(rep => {
            allRepayments.push({
                ...rep,
                borrower: loan.borrower,
                loanIssueDate: loan.issueDate
            });
        });
    });

    // Sort by date descending (newest first)
    allRepayments.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (allRepayments.length === 0) {
        els.noRepaymentsMessage.classList.remove('hidden');
    } else {
        els.noRepaymentsMessage.classList.add('hidden');
        
        allRepayments.forEach(rep => {
            const tr = document.createElement('tr');
            tr.className = 'text-sm border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors';
            
            const repD = new Date(rep.date).toLocaleDateString('en-GB', {day: '2-digit', month: 'short', year: 'numeric'});
            const issueD = new Date(rep.loanIssueDate).toLocaleDateString('en-GB', {day: '2-digit', month: 'short', year: '2-digit'});

            tr.innerHTML = `
                <td class="py-3 pl-2 whitespace-nowrap text-gray-500">${repD}</td>
                <td class="py-3 whitespace-nowrap font-medium text-gray-900">${rep.borrower}</td>
                <td class="py-3 whitespace-nowrap text-xs text-gray-400">Loan from ${issueD}</td>
                <td class="py-3 pr-2 text-right whitespace-nowrap font-bold text-green-600">+₹${rep.amount.toLocaleString()}</td>
            `;
            els.repaymentsTableBody.appendChild(tr);
        });
    }
};

// Global function to clear data cache
window.clearCache = () => {
    if (confirm("Are you sure you want to clear all data? This cannot be undone.")) {
        localStorage.removeItem('officeFundData');
        location.reload();
    }
};

// Global function for Tab Switching
window.switchTab = (tabName) => {
    // Hide all views
    document.getElementById('view-dashboard').classList.remove('block');
    document.getElementById('view-dashboard').classList.add('hidden');
    document.getElementById('view-monthly').classList.remove('block');
    document.getElementById('view-monthly').classList.add('hidden');
    document.getElementById('view-borrow').classList.remove('block');
    document.getElementById('view-borrow').classList.add('hidden');
    document.getElementById('view-repayments').classList.remove('block');
    document.getElementById('view-repayments').classList.add('hidden');
    
    // Show selected view
    document.getElementById(`view-${tabName}`).classList.remove('hidden');
    document.getElementById(`view-${tabName}`).classList.add('block');
    
    // Update active nav button
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`nav-${tabName}`).classList.add('active');
};

// Run app
document.addEventListener('DOMContentLoaded', init);
