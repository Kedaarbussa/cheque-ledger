import React, { useState, useMemo, useEffect } from 'react';
import { AlertCircle, IndianRupee, ArrowRightLeft, Plus, Edit2, Trash2, Calendar, CheckCircle2, Search, Filter, Pencil, ChevronDown, ChevronUp, Bell, LogOut, Download } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth';
import { auth, googleProvider } from './firebase';
import './App.css';

function App() {
    const [transactions, setTransactions] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [user, setUser] = useState(null);
    const [isAuthLoading, setIsAuthLoading] = useState(true);

    // Watch Authentication State
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            setIsAuthLoading(false);
        });
        return () => unsubscribe();
    }, []);

    // Initial Load - Fetch from API only if User exists
    useEffect(() => {
        if (!user) return;

        setIsLoading(true);
        const fetchTransactions = async () => {
            try {
                const response = await fetch(`/api/transactions?userId=${user.uid}`);
                if (response.ok) {
                    const data = await response.json();
                    setTransactions(data);
                } else {
                    console.error("Failed to fetch transactions:", response.statusText);
                }
            } catch (error) {
                console.error("Failed to fetch transactions:", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchTransactions();
    }, [user]);

    const [showAddForm, setShowAddForm] = useState(false);
    const [activeTab, setActiveTab] = useState('all'); // 'all', 'deposits', 'active-cheques', 'completed-cheques', 'summary'
    const [searchTerm, setSearchTerm] = useState('');
    const [dateFilter, setDateFilter] = useState('all'); // 'all', 'this-month', 'next-month'
    const [editTxnId, setEditTxnId] = useState(null);
    const [sortConfig, setSortConfig] = useState({ key: 'date', direction: 'asc' });

    // Form State
    const [newCheque, setNewCheque] = useState({
        type: 'withdrawal',
        date: new Date().toISOString().split('T')[0],
        chequeNo: '',
        payee: '',
        amount: '',
        status: 'pending'
    });

    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            maximumFractionDigits: 0,
        }).format(amount);
    };

    const handleAddCheque = async (e) => {
        e.preventDefault();
        if (!newCheque.date || !newCheque.payee || !newCheque.amount) return;

        const txnData = {
            ...newCheque,
            amount: parseFloat(newCheque.amount),
            userId: user.uid,
            userEmail: user.email
        };

        try {
            if (editTxnId) {
                // Update via API
                const resp = await fetch(`/api/transactions`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: editTxnId, ...txnData })
                });
                if (resp.ok) {
                    setTransactions(transactions.map(txn =>
                        txn.id === editTxnId ? { ...txn, ...txnData } : txn
                    ));
                } else {
                    console.error("Failed to update transaction:", resp.statusText);
                }
            } else {
                // Add new via API
                const resp = await fetch('/api/transactions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(txnData)
                });
                if (resp.ok) {
                    const savedTxn = await resp.json();
                    setTransactions([...transactions, savedTxn]);
                } else {
                    console.error("Failed to add transaction:", resp.statusText);
                }
            }
        } catch (error) {
            console.error("Failed to save transaction:", error);
        }

        closeForm();
    };

    const closeForm = () => {
        setNewCheque({
            type: 'withdrawal',
            date: new Date().toISOString().split('T')[0],
            chequeNo: '',
            payee: '',
            amount: '',
            status: 'pending'
        });
        setEditTxnId(null);
        setShowAddForm(false);
    };

    const handleEditTransaction = (txn) => {
        setNewCheque({
            type: txn.type,
            date: txn.date,
            chequeNo: txn.chequeNo || '',
            payee: txn.payee,
            amount: txn.amount.toString(),
            status: txn.status || 'pending'
        });
        setEditTxnId(txn.id);
        setShowAddForm(true);
    };

    const handleToggleStatus = async (txn) => {
        const newStatus = txn.status === 'cleared' ? 'pending' : 'cleared';
        try {
            const resp = await fetch(`/api/transactions`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: txn.id, userId: user.uid, status: newStatus })
            });
            if (resp.ok) {
                setTransactions(transactions.map(t =>
                    t.id === txn.id ? { ...t, status: newStatus } : t
                ));
            } else {
                console.error("Failed to update status:", resp.statusText);
            }
        } catch (error) {
            console.error("Failed to update status:", error);
        }
    };

    const handleDeleteTransaction = async (id) => {
        if (window.confirm('Are you sure you want to delete this transaction?')) {
            try {
                const resp = await fetch(`/api/transactions?id=${id}&userId=${user.uid}`, {
                    method: 'DELETE'
                });
                if (resp.ok) {
                    setTransactions(transactions.filter(txn => txn.id !== id));
                } else {
                    console.error("Failed to delete transaction:", resp.statusText);
                }
            } catch (error) {
                console.error("Failed to delete transaction:", error);
            }
        }
    };

    const { ledgerRows, totalWithdrawals, totalDeposits, totalRequiredDeposits, finalBalance, availableBalanceToday, requiredDepositsToday, requiredDepositsTomorrow, overdueDeposits, upcomingNeeds, monthlyData } = useMemo(() => {
        const startBalance = 0;

        // Sort transactions chronologically, putting deposits before withdrawals on the same day
        const sorted = [...transactions].sort((a, b) => {
            const dateDiff = new Date(a.date) - new Date(b.date);
            if (dateDiff === 0) {
                // If they fall on exactly the same date, prioritize deposits to avoid temporary negative balances
                if (a.type === 'deposit' && b.type === 'withdrawal') return -1;
                if (a.type === 'withdrawal' && b.type === 'deposit') return 1;
            }
            return dateDiff;
        });

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        let mathTotalWithdrawals = 0;
        let mathTotalDeposits = 0;
        let mathTodayWithdrawals = 0;
        let mathTodayDeposits = 0;
        let mathTomorrowWithdrawals = 0;
        let mathTomorrowDeposits = 0;
        
        const monthlyStats = {};
        const rows = [];
        let runningBalance = startBalance;

        // Pass 1: True Running Balances and Math Totals
        sorted.forEach((txn) => {
            const txnDate = new Date(txn.date);
            txnDate.setHours(0, 0, 0, 0);
            
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            
            const isImpactfulToday = today >= txnDate;
            const isImpactfulTomorrow = tomorrow >= txnDate;

            if (txn.type === 'withdrawal') {
                mathTotalWithdrawals += txn.amount;
                runningBalance -= txn.amount;
                if (isImpactfulToday) mathTodayWithdrawals += txn.amount;
                if (isImpactfulTomorrow) mathTomorrowWithdrawals += txn.amount;
            } else if (txn.type === 'deposit') {
                mathTotalDeposits += txn.amount;
                runningBalance += txn.amount;
                if (isImpactfulToday) mathTodayDeposits += txn.amount;
                if (isImpactfulTomorrow) mathTomorrowDeposits += txn.amount;
            }

            rows.push({
                ...txn,
                runningBalance: runningBalance
            });

            // Aggregate charts
            if (txn.type === 'withdrawal' || txn.type === 'deposit') {
                const monthKey = txnDate.toLocaleString('default', { month: 'short', year: 'numeric' });
                if (!monthlyStats[monthKey]) {
                    monthlyStats[monthKey] = { name: monthKey, Deposits: 0, Withdrawals: 0 };
                }
                if (txn.type === 'withdrawal') {
                    monthlyStats[monthKey].Withdrawals += txn.amount;
                } else {
                    monthlyStats[monthKey].Deposits += txn.amount;
                }
            }
        });

        const mathFinalBalance = startBalance + mathTotalDeposits - mathTotalWithdrawals;
        const mathTodayBalance = startBalance + mathTodayDeposits - mathTodayWithdrawals;
        const mathTomorrowBalance = startBalance + mathTomorrowDeposits - mathTomorrowWithdrawals;

        // Pass 2: FIFO Unpaid Cheques Calculation for Alerts
        let remainingShortfall = mathFinalBalance < 0 ? Math.abs(mathFinalBalance) : 0;
        const unpaidAlerts = [];
        
        if (remainingShortfall > 0) {
            for (let i = sorted.length - 1; i >= 0; i--) {
                const txn = sorted[i];
                if (txn.type === 'withdrawal' && remainingShortfall > 0) {
                    const unpaidAmountForThisCheque = Math.min(txn.amount, remainingShortfall);
                    
                    const chequeDate = new Date(txn.date);
                    chequeDate.setHours(0,0,0,0);
                    const daysUntilDue = Math.ceil((chequeDate - today) / (1000 * 60 * 60 * 24));
                    
                    unpaidAlerts.unshift({
                        amount: unpaidAmountForThisCheque,
                        dueDate: txn.date,
                        payee: txn.payee,
                        daysLeft: daysUntilDue,
                        isOverdue: daysUntilDue < 0
                    });
                    
                    remainingShortfall -= unpaidAmountForThisCheque;
                }
            }
        }

        // Calculate Overdue Total from the alerts
        const overdueTotal = unpaidAlerts.reduce((sum, alert) => alert.isOverdue ? sum + alert.amount : sum, 0);

        return {
            ledgerRows: rows,
            totalWithdrawals: mathTotalWithdrawals,
            totalDeposits: mathTotalDeposits,
            totalRequiredDeposits: mathFinalBalance < 0 ? Math.abs(mathFinalBalance) : 0,
            finalBalance: mathFinalBalance,
            availableBalanceToday: mathTodayBalance > 0 ? mathTodayBalance : 0,
            requiredDepositsToday: mathTodayBalance < 0 ? Math.abs(mathTodayBalance) : 0,
            requiredDepositsTomorrow: mathTomorrowBalance < 0 ? Math.abs(mathTomorrowBalance) : 0,
            overdueDeposits: overdueTotal,
            upcomingNeeds: unpaidAlerts,
            monthlyData: Object.values(monthlyStats)
        };
    }, [transactions]);

    const handleSort = (key) => {
        let direction = 'asc';
        if (sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const getSortIcon = (key) => {
        if (sortConfig.key !== key) return null;
        return sortConfig.direction === 'asc' ? <ChevronUp size={14} className="sort-icon" /> : <ChevronDown size={14} className="sort-icon" />;
    };

    const sortedRowOutput = useMemo(() => {
        let sortableRows = [...ledgerRows];

        sortableRows.sort((a, b) => {
            if (sortConfig.key === 'date') {
                return sortConfig.direction === 'asc'
                    ? new Date(a.date) - new Date(b.date)
                    : new Date(b.date) - new Date(a.date);
            }
            if (sortConfig.key === 'amount') {
                // For amount, we sort by absolute amount magnitude
                return sortConfig.direction === 'asc'
                    ? a.amount - b.amount
                    : b.amount - a.amount;
            }
            return 0;
        });

        // Apply filters
        return sortableRows.filter(row => {
            // 1. Tab Filtering
            if (activeTab === 'deposits' && row.type !== 'deposit' && row.type !== 'system-deposit') return false;
            if (activeTab === 'active-cheques' && (row.type !== 'withdrawal' || row.status === 'cleared')) return false;
            if (activeTab === 'completed-cheques' && (row.type !== 'withdrawal' || row.status !== 'cleared')) return false;

            // 2. Search filtering
            if (searchTerm) {
                const lowerSearch = searchTerm.toLowerCase();
                const matchPayee = row.payee.toLowerCase().includes(lowerSearch);
                const matchCheque = (row.chequeNo || '').toLowerCase().includes(lowerSearch);
                if (!matchPayee && !matchCheque) return false;
            }

            // 3. Date Filtering
            if (dateFilter !== 'all') {
                const rowDate = new Date(row.date);
                const now = new Date();

                if (dateFilter === 'this-month') {
                    if (rowDate.getMonth() !== now.getMonth() || rowDate.getFullYear() !== now.getFullYear()) return false;
                } else if (dateFilter === 'next-month') {
                    const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
                    if (rowDate.getMonth() !== nextMonthDate.getMonth() || rowDate.getFullYear() !== nextMonthDate.getFullYear()) return false;
                }
            }

            return true;
        });
    }, [ledgerRows, sortConfig, activeTab, searchTerm, dateFilter]);

    if (isAuthLoading) {
        return (
            <div className="app-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: 'var(--bg)' }}>
                <div style={{ padding: '2rem', background: '#fff', borderRadius: '1rem', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
                    Loading...
                </div>
            </div>
        );
    }

    if (!user) {
        return (
            <div className="app-container login-page">
                <main className="main-content" style={{ maxWidth: '400px', margin: '10vh auto', textAlign: 'center' }}>
                    <div className="login-box" style={{ background: '#fff', padding: '3rem', borderRadius: '1.5rem', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)' }}>
                        <div className="logo" style={{ justifyContent: 'center', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <IndianRupee size={40} className="logo-icon" color="var(--primary)" />
                            <h1 style={{ fontSize: '1.75rem', fontWeight: '700', color: 'var(--text)', margin: 0 }}>ChequeLedger</h1>
                        </div>
                        <p style={{ color: 'var(--text-light)', marginBottom: '2.5rem', lineHeight: '1.6' }}>
                            Securely manage your deposits and cheques. We'll automatically build your required deposit timeline.
                        </p>
                        <button
                            className="btn-save"
                            style={{ width: '100%', justifyContent: 'center', padding: '0.875rem', fontSize: '1.05rem', background: '#4285F4', borderRadius: '0.75rem', fontWeight: '600', transition: 'all 0.2s', border: '1px solid transparent' }}
                            onClick={() => signInWithPopup(auth, googleProvider).catch(err => console.error(err))}
                        >
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginRight: '10px' }}>
                                <path d="M23.52 12.2612C23.52 11.4556 23.4545 10.6695 23.3236 9.90381H12V14.3644H18.4691C18.1963 15.8208 17.3782 17.0628 16.1455 17.8927V20.7816H20.0182C22.2873 18.6871 23.52 15.7533 23.52 12.2612Z" fill="white" />
                                <path d="M12 24.0001C15.24 24.0001 17.9564 22.9241 19.9964 21.0583L16.1236 18.1694C15.0218 18.9135 13.6255 19.3444 12 19.3444C8.85818 19.3444 6.19636 17.2285 5.24727 14.3725H1.27636V17.4429C3.26182 21.3917 7.29818 24.0001 12 24.0001Z" fill="white" />
                                <path d="M5.24727 14.3727C5.00727 13.6547 4.86545 12.894 4.86545 12.1136C4.86545 11.3333 5.00727 10.5725 5.24727 9.85455V6.78418H1.27636C0.469091 8.35637 0 10.1802 0 12.1136C0 14.0471 0.469091 15.8709 1.27636 17.4431L5.24727 14.3727Z" fill="white" />
                                <path d="M12 4.88182C13.7673 4.88182 15.3382 5.48727 16.5818 6.64909L20.0836 3.14727C17.9345 1.15636 15.24 0 12 0C7.29818 0 3.26182 2.60836 1.27636 6.55727L5.24727 9.62764C6.19636 6.77164 8.85818 4.88182 12 4.88182Z" fill="white" />
                            </svg>
                            Sign in with Google
                        </button>
                    </div>
                </main>
            </div>
        );
    }

    return (
        <div className="app-container">
            <header className="header">
                <div className="header-content">
                    <div className="logo">
                        <IndianRupee size={32} className="logo-icon" />
                        <h1>ChequeLedger</h1>
                    </div>
                    <div className="header-actions" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                        <div className="user-profile" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <img src={user.photoURL || `https://ui-avatars.com/api/?name=${user.displayName || 'User'}&background=random`} alt="Avatar" style={{ width: '36px', height: '36px', borderRadius: '50%', border: '2px solid white', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }} />
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                <span style={{ fontWeight: '600', fontSize: '0.9rem', color: 'var(--text)' }}>{user.displayName || 'User'}</span>
                                <button className="logout-btn" onClick={() => signOut(auth)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--text-light)', fontSize: '0.8rem', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <LogOut size={12} /> Sign out
                                </button>
                            </div>
                        </div>
                        <div style={{ width: '1px', height: '30px', background: '#E2E8F0' }}></div>
                        <button className="add-btn" onClick={() => setShowAddForm(true)}>
                            <Plus size={20} />
                            <span>New Transaction</span>
                        </button>
                    </div>
                </div>
            </header>

            <main className="main-content">
                {upcomingNeeds.length > 0 && (
                    <div className="alert-banner">
                        <div className="alert-icon-container">
                            <Bell size={24} className="alert-bell-icon" />
                        </div>
                        <div className="alert-content">
                            <h3>Upcoming Funding Required!</h3>
                            <ul>
                                {upcomingNeeds.map((need, idx) => (
                                    <li key={idx}>
                                        {need.isOverdue && <span className="alert-highlight overdue">OVERDUE •</span>}
                                        You need to deposit <span className="alert-highlight amount">{formatCurrency(need.amount)}</span> by <strong>{new Date(need.dueDate).toLocaleDateString('en-IN')}</strong> ({need.daysLeft === 0 ? 'Today' : need.daysLeft < 0 ? `${Math.abs(need.daysLeft)} days ago` : `${need.daysLeft} days from now`}) for cheque to <span className="alert-highlight payee">{need.payee}</span>.
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                )}

                <section className="dashboard">
                    <div className="stat-card primary">
                        <div className="stat-icon"><IndianRupee /></div>
                        <div className="stat-info">
                            <h3>Available Balance (Today)</h3>
                            <h2 className={availableBalanceToday < 0 ? 'negative' : 'positive'}>
                                {formatCurrency(availableBalanceToday)}
                            </h2>
                        </div>
                    </div>

                    <div className="stat-card warning">
                        <div className="stat-icon"><ArrowRightLeft /></div>
                        <div className="stat-info">
                            <h3>Total Withdrawals</h3>
                            <h2>{formatCurrency(totalWithdrawals)}</h2>
                        </div>
                    </div>

                    <div className="stat-card primary" style={{ '--primary': 'var(--success)' }}>
                        <div className="stat-icon" style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--success)' }}><Plus /></div>
                        <div className="stat-info">
                            <h3>Total Deposits</h3>
                            <h2>{formatCurrency(totalDeposits)}</h2>
                        </div>
                    </div>

                    <div className="stat-card danger">
                        <div className="stat-icon"><AlertCircle /></div>
                        <div className="stat-info">
                            <h3>Required Deposits (By Today)</h3>
                            <h2>{formatCurrency(requiredDepositsToday)}</h2>
                        </div>
                    </div>

                    <div className="stat-card" style={{ '--primary': '#f59e0b', background: 'rgba(245, 158, 11, 0.02)', borderColor: 'rgba(245, 158, 11, 0.2)' }}>
                        <div className="stat-icon" style={{ background: 'rgba(245, 158, 11, 0.1)', color: '#f59e0b' }}><Calendar /></div>
                        <div className="stat-info">
                            <h3>Required Deposits (Tomorrow)</h3>
                            <h2 style={{ color: requiredDepositsTomorrow > 0 ? '#d97706' : 'var(--text-main)' }}>{formatCurrency(requiredDepositsTomorrow)}</h2>
                        </div>
                    </div>

                    <div className="stat-card" style={{ '--primary': '#dc2626', background: overdueDeposits > 0 ? 'rgba(220, 38, 38, 0.05)' : 'var(--card-bg)', borderColor: overdueDeposits > 0 ? 'rgba(220, 38, 38, 0.4)' : 'var(--glass-border)' }}>
                        <div className="stat-icon" style={{ background: overdueDeposits > 0 ? '#fee2e2' : 'var(--bg-hover)', color: overdueDeposits > 0 ? '#dc2626' : 'var(--text-light)' }}>
                            <AlertCircle />
                        </div>
                        <div className="stat-info">
                            <h3 style={{ color: overdueDeposits > 0 ? '#dc2626' : 'var(--text-light)' }}>Overdue Deposits</h3>
                            <h2 style={{ color: overdueDeposits > 0 ? '#b91c1c' : 'var(--text-main)', fontWeight: overdueDeposits > 0 ? '800' : '600' }}>
                                {formatCurrency(overdueDeposits)}
                            </h2>
                        </div>
                    </div>
                </section>


                <section className="ledger-section">
                    <div className="section-header">
                        <h2>Transaction Ledger</h2>
                        <div className="tabs">
                            <button
                                className={`tab-btn ${activeTab === 'all' ? 'active' : ''}`}
                                onClick={() => setActiveTab('all')}
                            >
                                All
                            </button>
                            <button
                                className={`tab-btn ${activeTab === 'deposits' ? 'active' : ''}`}
                                onClick={() => setActiveTab('deposits')}
                            >
                                Deposits
                            </button>
                            <button
                                className={`tab-btn ${activeTab === 'active-cheques' ? 'active' : ''}`}
                                onClick={() => setActiveTab('active-cheques')}
                            >
                                Active
                            </button>
                            <button
                                className={`tab-btn ${activeTab === 'completed-cheques' ? 'active' : ''}`}
                                onClick={() => setActiveTab('completed-cheques')}
                            >
                                Completed
                            </button>
                            <button
                                className={`tab-btn ${activeTab === 'summary' ? 'active' : ''}`}
                                onClick={() => setActiveTab('summary')}
                            >
                                Summary
                            </button>
                        </div>
                    </div>

                    {activeTab === 'summary' ? (
                        monthlyData.length > 0 ? (
                            <section className="chart-section" style={{ boxShadow: 'none', border: 'none', padding: '0 0 1.5rem 0' }}>
                                <div className="chart-container">
                                    <ResponsiveContainer width="100%" height={300}>
                                        <BarChart data={monthlyData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#64748B' }} />
                                            <YAxis
                                                axisLine={false}
                                                tickLine={false}
                                                tick={{ fill: '#64748B' }}
                                                tickFormatter={(value) => `₹${value / 1000}k`}
                                            />
                                            <Tooltip
                                                formatter={(value) => formatCurrency(value)}
                                                cursor={{ fill: 'rgba(226, 232, 240, 0.4)' }}
                                                contentStyle={{ borderRadius: '0.75rem', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}
                                            />
                                            <Legend wrapperStyle={{ paddingTop: '20px' }} />
                                            <Bar dataKey="Deposits" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={50} />
                                            <Bar dataKey="Withdrawals" fill="#F59E0B" radius={[4, 4, 0, 0]} maxBarSize={50} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </section>
                        ) : (
                            <div className="empty-state" style={{ padding: '3rem', textAlign: 'center' }}>
                                No transaction data available to generate a summary yet.
                            </div>
                        )
                    ) : (
                        <>
                            <div className="filters-row">
                                <div className="search-box">
                                    <Search size={18} className="search-icon" />
                                    <input
                                        type="text"
                                        placeholder="Search by Payee or Cheque No..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                    />
                                </div>
                                <div className="date-filter">
                                    <Filter size={18} className="filter-icon" />
                                    <select
                                        value={dateFilter}
                                        onChange={(e) => setDateFilter(e.target.value)}
                                    >
                                        <option value="all">All Dates</option>
                                        <option value="this-month">This Month</option>
                                        <option value="next-month">Next Month</option>
                                    </select>
                                </div>
                            </div>

                            <div className="table-container">
                                <table className="ledger-table">
                                    <thead>
                                        <tr>
                                            <th className="sortable-header" onClick={() => handleSort('date')}>
                                                Date {getSortIcon('date')}
                                            </th>
                                            <th>Cheque No</th>
                                            <th>Payee</th>
                                            <th className="amount-col sortable-header" onClick={() => handleSort('amount')}>
                                                <div className="sortable-content justify-end">
                                                    {getSortIcon('amount')} Amount
                                                </div>
                                            </th>
                                            <th className="balance-col">Running Balance</th>
                                            <th>Status</th>
                                            <th className="action-col"></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {isLoading ? (
                                            <tr>
                                                <td colSpan="7" className="empty-state" style={{ padding: '3rem' }}>
                                                    Loading transactions from database...
                                                </td>
                                            </tr>
                                        ) : (
                                            <>
                                                {activeTab === 'all' && searchTerm === '' && dateFilter === 'all' && sortConfig.key === 'date' && sortConfig.direction === 'asc' && (
                                                    <tr className="initial-row">
                                                        <td>-</td>
                                                        <td>-</td>
                                                        <td>Initial Balance</td>
                                                        <td className="amount-col">-</td>
                                                        <td className="balance-col positive">{formatCurrency(0)}</td> {/* startBalance is 0 now */}
                                                        <td></td>
                                                        <td></td>
                                                    </tr>
                                                )}
                                                {sortedRowOutput.length === 0 && (
                                                    <tr>
                                                        <td colSpan="7" className="empty-state">No cheques recorded yet. Add one above.</td>
                                                    </tr>
                                                )}
                                                {sortedRowOutput.map((row) => (
                                                    <tr key={row.id} className={row.type === 'deposit' ? 'deposit-row' : ''}>
                                                        <td>{new Date(row.date).toLocaleDateString('en-IN')}</td>
                                                        <td>{row.chequeNo || '-'}</td>
                                                        <td className={row.type === 'system-deposit' ? 'payee-col' : ''}>
                                                            {row.type === 'system-deposit' && <AlertCircle size={16} />}
                                                            {row.payee}
                                                        </td>
                                                        <td className={`amount-col ${row.type === 'system-deposit' || row.type === 'deposit' ? 'positive' : 'negative'}`}>
                                                            {row.type === 'system-deposit' || row.type === 'deposit' ? '+' : '-'}{formatCurrency(row.amount)}
                                                        </td>
                                                        <td className={`balance-col ${row.runningBalance > 0 ? 'positive' : row.runningBalance < 0 ? 'negative' : ''}`}>
                                                            {formatCurrency(row.runningBalance)}
                                                        </td>
                                                        <td>
                                                            {row.type === 'withdrawal' && (
                                                                <div className="status-toggle" onClick={() => handleToggleStatus(row)} style={{display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', width: 'fit-content'}}>
                                                                    <input type="checkbox" checked={row.status === 'cleared'} readOnly style={{cursor: 'pointer', margin: 0, accentColor: 'var(--success)'}} />
                                                                    <span className={`badge ${row.status === 'cleared' ? 'badge-success' : 'badge-warning'}`}>
                                                                        {row.status === 'cleared' ? 'Cleared' : 'Pending'}
                                                                    </span>
                                                                </div>
                                                            )}
                                                            {(row.type === 'deposit' || row.type === 'system-deposit') && (
                                                                <span className="badge badge-success">Completed</span>
                                                            )}
                                                        </td>
                                                        <td className="action-col">
                                                            {row.type !== 'system-deposit' && (
                                                                <div className="action-buttons">
                                                                    <button
                                                                        className="edit-btn"
                                                                        onClick={() => handleEditTransaction(row)}
                                                                        title="Edit Transaction"
                                                                    >
                                                                        <Pencil size={16} />
                                                                    </button>
                                                                    <button
                                                                        className="delete-btn"
                                                                        onClick={() => handleDeleteTransaction(row.id)}
                                                                        title="Delete Transaction"
                                                                    >
                                                                        <Trash2 size={16} />
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </section>
            </main>

            {/* Add/Edit Cheque Modal */}
            {showAddForm && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <div className="modal-header">
                            <h2>{editTxnId ? 'Edit Transaction' : 'New Transaction'}</h2>
                            <button className="close-btn" onClick={closeForm}>
                                <X size={24} />
                            </button>
                        </div>
                        <form onSubmit={handleAddCheque}>
                            <div className="form-group radio-group">
                                <label className="radio-label">
                                    <input
                                        type="radio"
                                        name="txnType"
                                        value="withdrawal"
                                        checked={newCheque.type === 'withdrawal'}
                                        onChange={(e) => setNewCheque({ ...newCheque, type: e.target.value })}
                                    />
                                    Cheque (Withdrawal)
                                </label>
                                <label className="radio-label">
                                    <input
                                        type="radio"
                                        name="txnType"
                                        value="deposit"
                                        checked={newCheque.type === 'deposit'}
                                        onChange={(e) => setNewCheque({ ...newCheque, type: e.target.value })}
                                    />
                                    Deposit
                                </label>
                            </div>
                            <div className="form-group">
                                <label>Date</label>
                                <input
                                    type="date"
                                    value={newCheque.date}
                                    onChange={(e) => setNewCheque({ ...newCheque, date: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Cheque Number (Optional)</label>
                                <input
                                    type="text"
                                    placeholder="e.g. 123456"
                                    value={newCheque.chequeNo}
                                    onChange={(e) => setNewCheque({ ...newCheque, chequeNo: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>{newCheque.type === 'withdrawal' ? 'Payee / Issued To' : 'Source / Description'}</label>
                                <input
                                    type="text"
                                    placeholder={newCheque.type === 'withdrawal' ? 'e.g. Electricity Board' : 'e.g. Salary'}
                                    value={newCheque.payee}
                                    onChange={(e) => setNewCheque({ ...newCheque, payee: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label>Amount (₹)</label>
                                <input
                                    type="number"
                                    min="1"
                                    placeholder="0"
                                    value={newCheque.amount}
                                    onChange={(e) => setNewCheque({ ...newCheque, amount: e.target.value })}
                                    required
                                />
                            </div>

                            <div className="form-actions">
                                <button type="button" className="btn-cancel" onClick={closeForm}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn-save">
                                    {editTxnId ? <Save size={18} /> : <Plus size={18} />}
                                    {editTxnId ? 'Update Transaction' : 'Add Transaction'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
