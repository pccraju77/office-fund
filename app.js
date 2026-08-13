// app.js

// Fixed list of 10 office members
const DEFAULT_MEMBERS = [
    "Renny", "Sheeja", "Libin", "rajesh", "avinash",
    "Makesh 1", "Mahesh 2", "Vignesh", "Shreenivas", "Sarath"
];
const CONTRIBUTION_AMOUNT = 500;
const INTEREST_RATE = 0.10; // 10%

// Cloud Database Configuration (JSONBin.io)
const BIN_ID = "6a7aa8aaf5f4af5e29057878";
const API_KEY = "$2a$10$lAGnRD1ydBudazYd82Xn.e5CdaPnBKCWlZ3.Ld.2yXZC8tjX6ZW/m";
const API_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

// Initial Data Structure
const getInitialData = () => ({
    members: [...DEFAULT_MEMBERS],
    contributions: {}, // Format: { "YYYY-MM": ["Member1", "Member2"] }
    loans: [] // Format: { id, borrower, amount, interest, totalDue, issueDate, deadline, status: 'active'|'closed', repayments: [{id, date, amount}] }
});

// Load local cache immediately
let appData = JSON.parse(localStorage.getItem('officeFundData')) || getInitialData();

// Backwards compatibility for older data
if (!appData.members) {
    appData.members = [...DEFAULT_MEMBERS];
}

appData.loans.forEach(loan => {
    if (!loan.repayments) {
        loan.repayments = [];
        if (loan.status === 'closed') {
            loan.repayments.push({
                id: 'legacy-' + loan.id,
                date: loan.deadline,
                amount: loan.totalDue
            });
        }
    }
});

let isSaving = false;

// Save data to Cloud and LocalStorage
const saveData = () => {
    // 1. Save to local storage for instant UI updates
    localStorage.setItem('officeFundData', JSON.stringify(appData));
    updateDashboard();
    
    // 2. Sync to cloud in background
    isSaving = true;
    fetch(API_URL, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            'X-Master-Key': API_KEY
        },
        body: JSON.stringify(appData)
    })
    .then(() => {
        isSaving = false;
    })
    .catch(err => {
        console.error("Cloud sync failed", err);
        isSaving = false;
        alert("Warning: Failed to save to cloud. Check your connection.");
    });
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
    noRepaymentsMessage: document.getElementById('noRepaymentsMessage'),
    addMemberSection: document.getElementById('addMemberSection'),
    addMemberForm: document.getElementById('addMemberForm'),
    newMemberName: document.getElementById('newMemberName'),
    newMemberEmail: document.getElementById('newMemberEmail')
};

const AUTH_PASSWORD = "2026";

// Initialize Application
const init = () => {
    if (!checkAuth()) return;
    initializeApp();
};

let currentRole = null;

const checkAuth = () => {
    const loginOverlay = document.getElementById('login-overlay');
    const appContainer = document.getElementById('app-container');
    const loginForm = document.getElementById('loginForm');
    const passwordInput = document.getElementById('passwordInput');
    const loginError = document.getElementById('loginError');

    const savedRole = sessionStorage.getItem('officeFundRole');
    if (savedRole === 'admin' || savedRole === 'viewer') {
        currentRole = savedRole;
        loginOverlay.classList.add('hidden');
        appContainer.classList.remove('hidden');
        return true;
    }

    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (passwordInput.value === AUTH_PASSWORD) {
            sessionStorage.setItem('officeFundRole', 'admin');
            currentRole = 'admin';
            loginOverlay.classList.add('hidden');
            appContainer.classList.remove('hidden');
            initializeApp();
        } else {
            loginError.classList.remove('hidden');
            passwordInput.value = '';
        }
    });

    return false;
};

window.loginAsViewer = () => {
    sessionStorage.setItem('officeFundRole', 'viewer');
    currentRole = 'viewer';
    document.getElementById('login-overlay').classList.add('hidden');
    document.getElementById('app-container').classList.remove('hidden');
    initializeApp();
};

const initializeApp = async () => {
    // 1. Initial UI Setup
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    els.contributionMonth.value = `${yyyy}-${mm}`;
    const dd = String(today.getDate()).padStart(2, '0');
    els.borrowDate.value = `${yyyy}-${mm}-${dd}`;
    
    populateBorrowerSelect();
    
    // RBAC Control: Hide elements if viewer
    if (currentRole === 'viewer') {
        document.getElementById('issueLoanSection').classList.add('hidden');
        document.getElementById('clearDataBtn').classList.add('hidden');
        els.addMemberSection.classList.add('hidden');
        document.getElementById('remindBtn').classList.add('hidden');
        const shareBtn = document.getElementById('shareDashboardBtnContainer');
        if (shareBtn) shareBtn.classList.add('hidden');
    } else {
        document.getElementById('issueLoanSection').classList.remove('hidden');
        document.getElementById('clearDataBtn').classList.remove('hidden');
        els.addMemberSection.classList.remove('hidden');
        document.getElementById('remindBtn').classList.remove('hidden');
        const shareBtn = document.getElementById('shareDashboardBtnContainer');
        if (shareBtn) shareBtn.classList.remove('hidden');
    }
    
    switchTab('dashboard');
    
    // Render immediately with local cache
    renderAll();

    // 2. Fetch from Cloud
    await fetchAndSyncCloud();

    // 3. Setup Auto-polling for Multi-User Real-time Sync
    // Polls every 10 seconds, but ONLY if the browser tab is actively visible to save API limits
    setInterval(() => {
        if (document.visibilityState === 'visible' && !isSaving) {
            fetchAndSyncCloud();
        }
    }, 10000);

    // Event Listeners
    if (!els.contributionMonth.dataset.listenerAdded) {
        els.contributionMonth.addEventListener('change', renderContributionList);
        els.borrowForm.addEventListener('submit', handleBorrow);
        if(els.addMemberForm) els.addMemberForm.addEventListener('submit', handleAddMember);
        els.contributionMonth.dataset.listenerAdded = 'true';
    }
};

const fetchAndSyncCloud = async () => {
    try {
        const res = await fetch(API_URL + '/latest', { 
            headers: { 'X-Master-Key': API_KEY } 
        });
        const json = await res.json();
        
        if (json.record) {
            const cloudData = json.record;
            
            // First time migration: if cloud is empty but local has data, upload local to cloud
            const isCloudEmpty = Object.keys(cloudData.contributions || {}).length === 0 && (cloudData.loans || []).length === 0;
            const hasLocalData = Object.keys(appData.contributions || {}).length > 0 || (appData.loans || []).length > 0;
            
            if (isCloudEmpty && hasLocalData) {
                console.log("Migrating local data to cloud...");
                saveData();
                return;
            }
            
            // Backwards compatibility for older cloud data
            if (!cloudData.members) {
                cloudData.members = [...DEFAULT_MEMBERS];
            }
            if (!cloudData.memberEmails) {
                cloudData.memberEmails = {};
            }

            // If cloud data is different from local data (another user updated it)
            if (JSON.stringify(cloudData) !== JSON.stringify(appData)) {
                console.log("Cloud update detected, syncing UI...");
                appData = cloudData;
                localStorage.setItem('officeFundData', JSON.stringify(appData));
                renderAll();
            }
        }
    } catch (e) {
        console.error("Failed to fetch from cloud", e);
    }
};

const renderAll = () => {
    renderContributionList();
    renderLoansTable();
    renderRepaymentReport();
    updateDashboard();
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
        const repaidSoFar = (loan.repayments || []).reduce((sum, r) => sum + r.amount, 0);
        totalPrincipals += loan.amount;
        totalRepayments += repaidSoFar;

        if (loan.status === 'active') {
            activeLent += loan.amount;
        } else if (loan.status === 'closed') {
            earnedInterest += loan.interest;
        }
    });

    const availableBalance = totalContributions - totalPrincipals + totalRepayments;

    els.totalCollected.textContent = `₹${totalContributions.toLocaleString()}`;
    els.availableBalance.textContent = `₹${availableBalance.toLocaleString()}`;
    els.totalLent.textContent = `₹${activeLent.toLocaleString()}`;
    els.totalInterest.textContent = `₹${earnedInterest.toLocaleString()}`;
};

// Populate Members Dropdown
const populateBorrowerSelect = () => {
    els.borrowerSelect.innerHTML = '<option value="" disabled selected>Choose a member...</option>';
    appData.members.forEach(member => {
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

    appData.members.forEach(member => {
        const isPaid = paidMembers.includes(member);
        const email = (appData.memberEmails && appData.memberEmails[member]) ? appData.memberEmails[member] : '';
        const emailDisplay = email ? `<div class="text-xs text-gray-400 font-normal mt-0.5">${email}</div>` : '';
        const editEmailBtn = currentRole === 'admin' ? 
            `<button onclick="editEmail('${member}')" class="ml-2 text-gray-300 hover:text-indigo-600 shrink-0" title="Edit Email">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>
            </button>` : '';

        const tr = document.createElement('tr');
        tr.className = 'text-sm border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors';
        
        tr.innerHTML = `
            <td class="py-3 pl-2 whitespace-nowrap">
                <div class="flex items-center">
                    ${currentRole === 'admin' ? `<button onclick="removeMember('${member}')" class="text-red-400 hover:text-red-600 focus:outline-none mr-2" title="Remove Member"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg></button>` : ''}
                    <div class="flex flex-col">
                        <span class="font-medium ${isPaid ? 'text-gray-900' : 'text-gray-600'} flex items-center">${member}${editEmailBtn}</span>
                        ${emailDisplay}
                    </div>
                </div>
            </td>
            <td class="py-3 whitespace-nowrap text-center">
                <input type="checkbox" class="member-checkbox mx-auto" data-member="${member}" ${isPaid ? 'checked' : ''} ${currentRole === 'viewer' ? 'disabled' : ''}>
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
            
            // Update row UI instantly
            const nameSpan = tr.querySelector('.font-medium');
            const amountSpan = tr.querySelector('td:last-child span');
            
            if (isChecked) {
                nameSpan.className = 'font-medium text-gray-900 flex items-center';
                amountSpan.className = 'font-bold text-green-600';
                amountSpan.textContent = '₹' + CONTRIBUTION_AMOUNT.toLocaleString();
            } else {
                nameSpan.className = 'font-medium text-gray-600 flex items-center';
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

    if (isPaid && confirm(`Share contribution receipt for ${member} to WhatsApp?`)) {
        const msg = `💸 *Monthly Contribution*\n👤 Member: ${member}\n📅 Month: ${month}\n💵 Paid: Rs ${CONTRIBUTION_AMOUNT}`;
        sendWhatsAppNotification(msg);
    }
};

const handleAddMember = (e) => {
    e.preventDefault();
    const name = els.newMemberName.value.trim();
    const email = els.newMemberEmail.value.trim();
    
    if (!name) return;
    
    if (appData.members.includes(name)) {
        alert("Member already exists in the active list!");
        return;
    }
    
    appData.members.push(name);
    if (email) {
        if (!appData.memberEmails) appData.memberEmails = {};
        appData.memberEmails[name] = email;
    }
    
    saveData();
    els.newMemberName.value = '';
    els.newMemberEmail.value = '';
    renderContributionList();
    populateBorrowerSelect();
};

window.removeMember = (member) => {
    if (confirm(`Are you sure you want to remove ${member} from the active list? Their historical data will not be deleted.`)) {
        appData.members = appData.members.filter(m => m !== member);
        saveData();
        renderContributionList();
        populateBorrowerSelect();
    }
};

window.editEmail = async (member) => {
    const currentEmail = (appData.memberEmails && appData.memberEmails[member]) ? appData.memberEmails[member] : '';
    const newEmail = prompt(`Enter email address for ${member}:`, currentEmail);
    if (newEmail !== null) {
        if (!appData.memberEmails) appData.memberEmails = {};
        appData.memberEmails[member] = newEmail.trim();
        await saveData();
        renderContributionList();
    }
};

window.sendReminders = () => {
    const month = els.contributionMonth.value;
    const paidMembers = appData.contributions[month] || [];
    const unpaidMembers = appData.members.filter(m => !paidMembers.includes(m));
    
    if (unpaidMembers.length === 0) {
        alert("All members have paid for this month!");
        return;
    }
    
    if (!appData.memberEmails) appData.memberEmails = {};
    
    const bccList = unpaidMembers
        .map(m => appData.memberEmails[m])
        .filter(email => email && email.trim() !== '')
        .join(',');
        
    if (!bccList) {
        alert("Please add an email address to at least one unpaid member first! Click the tiny pencil icon next to their name in the list to save their email.");
        return;
    }
    
    const subject = encodeURIComponent(`Reminder: Monthly Contribution Due - ${month}`);
    const body = encodeURIComponent(`Hello,\n\nThis is a friendly reminder that your monthly contribution (Rs ${CONTRIBUTION_AMOUNT}) for ${month} is currently due.\n\nPlease complete your payment at your earliest convenience.\n\nThank you.`);
    
    // Open directly in Gmail (web) instead of relying on desktop mail clients
    const gmailLink = `https://mail.google.com/mail/?view=cm&fs=1&bcc=${bccList}&su=${subject}&body=${body}`;
    window.open(gmailLink, '_blank');
};

const getAvailableBalance = () => {
    let totalContributions = Object.values(appData.contributions).reduce((acc, monthArray) => acc + (monthArray.length * CONTRIBUTION_AMOUNT), 0);
    let totalPrincipals = appData.loans.reduce((acc, l) => acc + l.amount, 0);
    let totalRepayments = appData.loans.reduce((acc, l) => acc + (l.repayments||[]).reduce((sum, r) => sum + r.amount, 0), 0);
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

    const interest = amount * INTEREST_RATE;
    const totalDue = amount + interest;
    
    const dateObj = new Date(issueDate);
    dateObj.setMonth(dateObj.getMonth() + 3);
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
    
    els.borrowForm.reset();
    els.borrowDate.value = issueDate; 
    
    renderLoansTable();

    if (confirm("Loan issued successfully! Share notification to WhatsApp?")) {
        const msg = `📢 *New Loan Issued*\n👤 Borrower: ${borrower}\n💰 Amount: Rs ${amount}\n📅 Due Date: ${new Date(deadlineStr).toLocaleDateString('en-GB')}`;
        sendWhatsAppNotification(msg);
    }
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
            const repaidSoFar = (loan.repayments||[]).reduce((sum, r) => sum + r.amount, 0);
            const remainingDue = loan.totalDue - repaidSoFar;
            
            const tr = document.createElement('tr');
            tr.className = 'text-sm border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors';
            
            const isActive = loan.status === 'active';
            const statusDot = isActive ? 'bg-green-500' : 'bg-gray-400';
            
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
                <td class="py-3 pr-2 text-right whitespace-nowrap flex justify-end gap-2 items-center">
                    ${currentRole === 'admin' && isActive ? `<button onclick="repayInstallment('${loan.id}')" class="bg-white border border-green-200 text-green-700 hover:bg-green-50 px-3 py-1.5 rounded-md text-xs font-semibold shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-green-500/50">Pay</button>` : ''}
                    ${currentRole === 'admin' && isActive ? `<button onclick="deleteLoan('${loan.id}')" class="bg-red-50 text-red-600 hover:bg-red-100 hover:text-red-700 p-1.5 rounded-md transition-colors" title="Delete Loan"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg></button>` : ''}
                    ${currentRole === 'viewer' && isActive ? `<span class="text-xs font-semibold text-gray-400 uppercase">Active</span>` : ''}
                    ${!isActive ? `<span class="text-xs font-semibold text-gray-400 uppercase">Settled</span>` : ''}
                </td>
            `;
            els.loansTableBody.appendChild(tr);
        });
    }
};

window.repayInstallment = (id) => {
    const loan = appData.loans.find(l => l.id === id);
    if (!loan || loan.status !== 'active') return;

    const repaidSoFar = (loan.repayments||[]).reduce((sum, r) => sum + r.amount, 0);
    const remainingDue = loan.totalDue - repaidSoFar;

    const input = prompt(`Repaying loan for ${loan.borrower}.\nRemaining Due: ₹${remainingDue.toLocaleString()}\nEnter amount to repay today:`, remainingDue);
    if (input === null) return;
    
    const amount = parseFloat(input);
    if (isNaN(amount) || amount <= 0) {
        alert("Please enter a valid positive amount.");
        return;
    }
    if (amount > remainingDue) {
        alert(`You cannot repay more than the remaining due (₹${remainingDue.toLocaleString()}).`);
        return;
    }

    const today = new Date().toISOString().split('T')[0];
    loan.repayments.push({
        id: Date.now().toString(),
        date: today,
        amount: amount
    });

    const newRepaidSoFar = loan.repayments.reduce((sum, r) => sum + r.amount, 0);
    const isSettled = newRepaidSoFar >= loan.totalDue;
    if (isSettled) {
        loan.status = 'closed';
        alert(`Loan fully settled for ${loan.borrower}!`);
    } else {
        alert(`Successfully recorded partial repayment of ₹${amount.toLocaleString()} for ${loan.borrower}.`);
    }

    saveData();
    renderLoansTable();
    renderRepaymentReport();

    if (confirm("Share repayment receipt to WhatsApp?")) {
        const remaining = loan.totalDue - newRepaidSoFar;
        const statusMsg = isSettled ? "✅ *Loan Fully Settled!*" : "✅ *Loan Repayment*";
        const msg = `${statusMsg}\n👤 Member: ${loan.borrower}\n💵 Paid: Rs ${amount}\n📉 Remaining Due: Rs ${remaining > 0 ? remaining : 0}`;
        sendWhatsAppNotification(msg);
    }
};

window.deleteLoan = (id) => {
    if (confirm("Are you sure you want to permanently delete this loan? This will revert all associated balances and erase its repayments.")) {
        appData.loans = appData.loans.filter(l => l.id !== id);
        saveData();
        renderLoansTable();
        renderRepaymentReport();
    }
};

const renderRepaymentReport = () => {
    els.repaymentsTableBody.innerHTML = '';
    
    let allRepayments = [];
    appData.loans.forEach(loan => {
        (loan.repayments||[]).forEach(rep => {
            allRepayments.push({
                ...rep,
                borrower: loan.borrower,
                loanIssueDate: loan.issueDate
            });
        });
    });

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

window.lockApp = () => {
    sessionStorage.removeItem('officeFundRole');
    currentRole = null;
    document.getElementById('login-overlay').classList.remove('hidden');
    document.getElementById('app-container').classList.add('hidden');
    document.getElementById('passwordInput').value = '';
    document.getElementById('loginError').classList.add('hidden');
};

window.clearCache = async () => {
    if (confirm("WARNING: Are you sure you want to PERMANENTLY DELETE ALL DATA? This will wipe the cloud database and cannot be undone.")) {
        appData = getInitialData();
        localStorage.setItem('officeFundData', JSON.stringify(appData));
        
        try {
            isSaving = true;
            await fetch(API_URL, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Master-Key': API_KEY
                },
                body: JSON.stringify(appData)
            });
        } catch (e) {
            console.error("Failed to clear cloud", e);
        }
        
        location.reload();
    }
};

window.switchTab = (tabName) => {
    ['dashboard', 'monthly', 'borrow', 'repayments'].forEach(t => {
        document.getElementById(`view-${t}`).classList.add('hidden');
        document.getElementById(`view-${t}`).classList.remove('block');
        document.getElementById(`nav-${t}`).classList.remove('active');
    });
    
    document.getElementById(`view-${tabName}`).classList.remove('hidden');
    document.getElementById(`view-${tabName}`).classList.add('block');
    document.getElementById(`nav-${tabName}`).classList.add('active');
};

window.downloadPDF = (type) => {
    if (!window.jspdf || !window.jspdf.jsPDF) {
        alert("PDF library is still loading, please try again in a moment.");
        return;
    }
    
    const doc = new window.jspdf.jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    
    doc.setFontSize(18);
    doc.text("Onteq Finance Club", pageWidth / 2, 15, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, pageWidth / 2, 22, { align: 'center' });
    
    if (type === 'monthly') {
        const month = els.contributionMonth.value;
        const paidMembers = appData.contributions[month] || [];
        
        doc.setFontSize(14);
        doc.text(`Monthly Contributions Report: ${month}`, 14, 35);
        
        const tableData = appData.members.map(member => {
            const isPaid = paidMembers.includes(member);
            return [
                member,
                isPaid ? "PAID" : "UNPAID",
                isPaid ? `Rs ${CONTRIBUTION_AMOUNT}` : "Rs 0"
            ];
        });
        
        doc.autoTable({
            startY: 40,
            head: [['Member Name', 'Status', 'Amount']],
            body: tableData,
            theme: 'striped',
            headStyles: { fillColor: [79, 70, 229] }
        });
        
        doc.save(`Monthly_Report_${month}.pdf`);
        
    } else if (type === 'borrow') {
        doc.setFontSize(14);
        doc.text(`Borrower Report`, 14, 35);
        
        const tableData = appData.loans.map(loan => {
            const repaidSoFar = (loan.repayments||[]).reduce((sum, r) => sum + r.amount, 0);
            const remainingDue = loan.totalDue - repaidSoFar;
            const status = loan.status === 'active' ? 'ACTIVE' : 'SETTLED';
            const dates = `Out: ${loan.issueDate}\nDue: ${loan.deadline}`;
            
            return [
                loan.borrower,
                `Rs ${loan.amount}`,
                `Rs ${loan.interest}`,
                `Rs ${remainingDue}`,
                dates,
                status
            ];
        });
        
        doc.autoTable({
            startY: 40,
            head: [['Borrower', 'Amount', 'Interest', 'Remaining Due', 'Dates', 'Status']],
            body: tableData,
            theme: 'striped',
            headStyles: { fillColor: [79, 70, 229] }
        });
        
        doc.save(`Borrow_Report.pdf`);
        
    } else if (type === 'repayments') {
        doc.setFontSize(14);
        doc.text(`Repayment Installments Report`, 14, 35);
        
        let allRepayments = [];
        appData.loans.forEach(loan => {
            (loan.repayments||[]).forEach(rep => {
                allRepayments.push({
                    ...rep,
                    borrower: loan.borrower,
                    loanIssueDate: loan.issueDate
                });
            });
        });
        allRepayments.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        const tableData = allRepayments.map(rep => {
            return [
                rep.date,
                rep.borrower,
                `Loan from ${rep.loanIssueDate}`,
                `Rs ${rep.amount}`
            ];
        });
        
        doc.autoTable({
            startY: 40,
            head: [['Date', 'Borrower', 'Loan Details', 'Amount Repaid']],
            body: tableData,
            theme: 'striped',
            headStyles: { fillColor: [79, 70, 229] }
        });
        
        doc.save(`Repayments_Report.pdf`);
    }
};

window.sendWhatsAppNotification = (message) => {
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodedMessage}`;
    window.open(whatsappUrl, '_blank');
};

window.shareDashboardToWhatsApp = () => {
    const available = getAvailableBalance();
    
    let activeLent = 0;
    appData.loans.forEach(loan => {
        if (loan.status === 'active') {
            activeLent += loan.amount;
        }
    });

    let totalContributions = 0;
    for (const month in appData.contributions) {
        totalContributions += appData.contributions[month].length * CONTRIBUTION_AMOUNT;
    }

    const msg = `📊 *Office Fund Summary*\n💰 Total Collected: Rs ${totalContributions.toLocaleString()}\n💸 Active Lent: Rs ${activeLent.toLocaleString()}\n💵 Available Balance: Rs ${available.toLocaleString()}`;
    sendWhatsAppNotification(msg);
};

document.addEventListener('DOMContentLoaded', init);
