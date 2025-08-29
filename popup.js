// Enhanced popup.js with multiple summary types, caching, and export features

class PopupManager {
    constructor() {
        this.storage = new SummaryStorage();
        this.exportManager = new ExportManager();
        this.currentSummary = null;
        this.currentVideoInfo = null;
        this.autoSaveEnabled = true;
        
        this.init();
    }

    async init() {
        await this.setupEventListeners();
        await this.loadSettings();
        await this.loadSavedSummaries();
        this.updateUI();
    }

    async setupEventListeners() {
        // Tab switching
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });

        // Summary type selection
        document.querySelectorAll('input[name="summaryType"]').forEach(radio => {
            radio.addEventListener('change', () => this.updateSummaryTypeSelection());
        });

        // Main generate button
        document.getElementById('summarizeBtn').addEventListener('click', () => this.generateSummary());

        // Auto-save toggle
        document.getElementById('autoSaveToggle').addEventListener('click', () => this.toggleAutoSave());

        // Export buttons
        document.getElementById('exportPdf').addEventListener('click', () => this.exportCurrentSummary('pdf'));
        document.getElementById('exportMd').addEventListener('click', () => this.exportCurrentSummary('markdown'));
        document.getElementById('saveSummary').addEventListener('click', () => this.saveCurrentSummary());

        // Search functionality
        document.getElementById('searchBox').addEventListener('input', (e) => this.searchSummaries(e.target.value));

        // Settings
        document.getElementById('defaultSummaryType').addEventListener('change', () => this.saveSettings());
        document.getElementById('autoSaveEnabled').addEventListener('change', () => this.saveSettings());
        document.getElementById('exportDataBtn').addEventListener('click', () => this.exportAllData());
        document.getElementById('clearDataBtn').addEventListener('click', () => this.clearAllData());
    }

    // Tab Management
    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.toggle('active', content.id === `${tabName}-tab`);
        });

        // Load content for specific tabs
        if (tabName === 'saved') {
            this.loadSavedSummaries();
        }
    }

    // Summary Generation
    async generateSummary() {
        const summarizeBtn = document.getElementById('summarizeBtn');
        const outputDiv = document.getElementById('output');
        const summaryContent = document.getElementById('summaryContent');

        try {
            // Disable button and show loading
            summarizeBtn.disabled = true;
            summarizeBtn.textContent = '🔄 Generating...';
            outputDiv.style.display = 'block';
            summaryContent.textContent = 'Extracting transcript...';

            // Check usage limits
            const usageAllowed = await this.checkUsageLimit();
            if (!usageAllowed) {
                this.showUpgradePrompt();
                return;
            }

            // Get selected summary type
            const summaryType = document.querySelector('input[name="summaryType"]:checked').value;

            // Get transcript from current tab
            const transcriptData = await this.getTranscriptFromCurrentTab();
            if (!transcriptData.transcript) {
                throw new Error('No transcript available for this video');
            }

            this.currentVideoInfo = transcriptData.videoInfo;
            summaryContent.textContent = 'Generating Transcript summary...';

            // Generate summary with selected type
            const summary = await this.generateAISummary(transcriptData.transcript, summaryType);
            
            // Store current summary
            this.currentSummary = {
                content: summary,
                summaryType: summaryType,
                videoInfo: this.currentVideoInfo,
                videoUrl: await this.getCurrentVideoUrl(),
                transcript: transcriptData.transcript
            };

            // Display summary
            summaryContent.innerHTML = this.formatSummaryForDisplay(summary, summaryType);

            // Auto-save if enabled
            if (this.autoSaveEnabled) {
                await this.saveCurrentSummary(false); // Don't show notification for auto-save
            }

        } catch (error) {
            console.error('Summary generation error:', error);
            summaryContent.innerHTML = `
                <div style="color: #dc3545; text-align: center; padding: 20px;">
                    <strong>❌ Error:</strong> ${error.message}
                    <br><br>
                    <button onclick="location.reload()" style="padding: 8px 16px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">
                        Try Again
                    </button>
                </div>
            `;
        } finally {
            summarizeBtn.disabled = false;
            summarizeBtn.textContent = '🚀 Generate Summary';
        }
    }

    async generateAISummary(transcript, summaryType) {
        const apiKey = await this.getApiKey();
        if (!apiKey) {
            throw new Error('OpenAI API key not configured. Please check settings.');
        }

        const systemPrompts = {
            'bullet-points': 'Summarize the following transcript in 5-7 clear bullet points. Focus on the main ideas and key takeaways.',
            'paragraph': 'Summarize the following transcript in 2-3 well-structured paragraphs. Provide a comprehensive overview of the main topics covered.',
            'outline': 'Create a structured outline of the transcript with main topics and subtopics. Use hierarchical numbering (1, 1.1, 1.2, etc.).',
            'qa': 'Extract the main points from the transcript and present them as 5-6 question-answer pairs. Include the most important information.',
            'timeline': 'Create a timeline summary of the transcript, highlighting key moments and topics in chronological order.',
            'mindmap': 'Create a text-based mind map structure of the transcript, showing the central topic and branching subtopics.'
        };

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: systemPrompts[summaryType] },
                    { role: "user", content: transcript }
                ],
                temperature: 0.7,
                max_tokens: 1000
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`AI API Error: ${errorData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    }

    formatSummaryForDisplay(summary, type) {
        switch (type) {
            case 'bullet-points':
                // Convert to HTML list if not already formatted
                if (summary.includes('•') || summary.includes('-')) {
                    return summary.replace(/[•-]\s*/g, '<li>').replace(/\n/g, '</li>\n<li>').replace(/<li><\/li>/g, '').replace(/^<li>/, '<ul><li>').replace(/$/, '</li></ul>');
                }
                return `<ul><li>${summary.split('. ').join('</li><li>')}</li></ul>`;
            
            case 'outline':
                return summary.replace(/\n/g, '<br>').replace(/(\d+\.)/g, '<strong>$1</strong>');
            
            case 'qa':
                return summary.replace(/(Q:|Question:)/gi, '<br><strong>Q:</strong>').replace(/(A:|Answer:)/gi, '<br><strong>A:</strong>');
            
            case 'timeline':
                return summary.replace(/(\d+:\d+)/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
            
            case 'mindmap':
                return summary.replace(/\n/g, '<br>').replace(/^(\s*)([^\s])/gm, '$1<strong>$2</strong>');
            
            default:
                return summary.replace(/\n/g, '<br>');
        }
    }

    // Current tab transcript extraction
    async getTranscriptFromCurrentTab() {
        return new Promise((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                chrome.tabs.sendMessage(tabs[0].id, { action: "getTranscript" }, (response) => {
                    if (response?.transcriptUrl) {
                        // Fetch transcript from URL
                        chrome.runtime.sendMessage({ 
                            action: "fetchTranscript", 
                            url: response.transcriptUrl 
                        }, (res) => {
                            resolve({
                                transcript: res?.transcript || null,
                                videoInfo: response.videoInfo || {},
                                method: 'api'
                            });
                        });
                    } else {
                        resolve({
                            transcript: response?.transcript || null,
                            videoInfo: response?.videoInfo || {},
                            method: 'panel'
                        });
                    }
                });
            });
        });
    }

    async getCurrentVideoUrl() {
        return new Promise((resolve) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                resolve(tabs[0]?.url || '');
            });
        });
    }

    // Usage and API management
    async checkUsageLimit() {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: "trackUsage" }, (response) => {
                resolve(response?.allowed || false);
            });
        });
    }

    async getApiKey() {
        const result = await chrome.storage.local.get(['openaiApiKey']);
        return result.openaiApiKey || null;
    }

    // Summary type selection
    updateSummaryTypeSelection() {
        document.querySelectorAll('.type-option').forEach(option => {
            const radio = option.querySelector('input[type="radio"]');
            option.classList.toggle('selected', radio.checked);
        });
    }

    // Auto-save functionality
    toggleAutoSave() {
        this.autoSaveEnabled = !this.autoSaveEnabled;
        const button = document.getElementById('autoSaveToggle');
        button.textContent = `💾 Auto-save: ${this.autoSaveEnabled ? 'ON' : 'OFF'}`;
        button.classList.toggle('btn-primary', this.autoSaveEnabled);
        button.classList.toggle('btn-secondary', !this.autoSaveEnabled);
        
        // Save setting
        this.saveSettings();
    }

    // Export functionality
    async exportCurrentSummary(format) {
        if (!this.currentSummary) {
            alert('No summary to export. Please generate a summary first.');
            return;
        }

        try {
            let result;
            
            switch (format) {
                case 'pdf':
                    result = await this.exportManager.exportToPDF(this.currentSummary);
                    break;
                case 'markdown':
                    result = this.exportManager.exportToMarkdown(this.currentSummary);
                    break;
                case 'text':
                    result = this.exportManager.exportToText(this.currentSummary);
                    break;
                default:
                    throw new Error('Unsupported export format');
            }

            if (result.success) {
                this.showToast(`✅ Exported as ${result.fileName}`, 'success');
            }

        } catch (error) {
            console.error('Export error:', error);
            this.showToast(`❌ Export failed: ${error.message}`, 'error');
        }
    }

    // Save summary
    async saveCurrentSummary(showNotification = true) {
        if (!this.currentSummary) {
            if (showNotification) {
                this.showToast('❌ No summary to save', 'error');
            }
            return;
        }

        try {
            await this.storage.saveSummary(this.currentSummary);
            
            if (showNotification) {
                this.showToast('✅ Summary saved!', 'success');
            }

            // Refresh saved summaries if on that tab
            if (document.querySelector('.tab.active').dataset.tab === 'saved') {
                await this.loadSavedSummaries();
            }

        } catch (error) {
            console.error('Save error:', error);
            if (showNotification) {
                this.showToast(`❌ Save failed: ${error.message}`, 'error');
            }
        }
    }

    // Saved summaries management
    async loadSavedSummaries() {
        const listContainer = document.getElementById('savedSummariesList');
        listContainer.innerHTML = '<div class="loading">Loading saved summaries...</div>';

        try {
            const summaries = await this.storage.getAllSummaries();
            
            if (summaries.length === 0) {
                listContainer.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: #6c757d;">
                        <div style="font-size: 48px; margin-bottom: 16px;">📝</div>
                        <p>No saved summaries yet.</p>
                        <p style="font-size: 12px;">Generate and save summaries to see them here!</p>
                    </div>
                `;
                return;
            }

            listContainer.innerHTML = summaries.map(summary => this.createSummaryListItem(summary)).join('');

        } catch (error) {
            console.error('Error loading summaries:', error);
            listContainer.innerHTML = `
                <div style="color: #dc3545; text-align: center; padding: 20px;">
                    ❌ Error loading summaries: ${error.message}
                </div>
            `;
        }
    }

    createSummaryListItem(summary) {
        const createdDate = new Date(summary.createdAt).toLocaleDateString();
        const typeIcon = this.getSummaryTypeIcon(summary.summaryType);
        
        return `
            <div class="summary-item" data-id="${summary.id}">
                <div class="summary-info">
                    <div class="summary-title">${typeIcon} ${summary.title}</div>
                    <div class="summary-meta">${summary.channel} • ${createdDate}</div>
                </div>
                <div class="summary-actions">
                    <button class="icon-btn" onclick="popupManager.viewSummary('${summary.id}')" title="View">👁️</button>
                    <button class="icon-btn" onclick="popupManager.toggleFavorite('${summary.id}')" title="Favorite">
                        ${summary.isFavorite ? '❤️' : '🤍'}
                    </button>
                    <button class="icon-btn" onclick="popupManager.exportSavedSummary('${summary.id}', 'markdown')" title="Export">📤</button>
                    <button class="icon-btn" onclick="popupManager.deleteSummary('${summary.id}')" title="Delete">🗑️</button>
                </div>
            </div>
        `;
    }

    getSummaryTypeIcon(type) {
        const icons = {
            'bullet-points': '•',
            'paragraph': '📄',
            'outline': '📋',
            'qa': '❓',
            'timeline': '⏱️',
            'mindmap': '🧠'
        };
        return icons[type] || '📝';
    }

    // Saved summary actions
    async viewSummary(id) {
        try {
            const summary = await this.storage.getSummaryById(id);
            if (summary) {
                // Switch to generate tab and show the summary
                this.switchTab('generate');
                
                this.currentSummary = summary;
                document.getElementById('output').style.display = 'block';
                document.getElementById('summaryContent').innerHTML = this.formatSummaryForDisplay(summary.content, summary.summaryType);
            }
        } catch (error) {
            console.error('Error viewing summary:', error);
            this.showToast(`❌ Error loading summary: ${error.message}`, 'error');
        }
    }

    async toggleFavorite(id) {
        try {
            await this.storage.toggleFavorite(id);
            await this.loadSavedSummaries(); // Refresh the list
        } catch (error) {
            console.error('Error toggling favorite:', error);
            this.showToast(`❌ Error updating favorite: ${error.message}`, 'error');
        }
    }

    async exportSavedSummary(id, format) {
        try {
            const summary = await this.storage.getSummaryById(id);
            if (summary) {
                const result = await this.exportManager.exportToMarkdown(summary);
                if (result.success) {
                    this.showToast(`✅ Exported as ${result.fileName}`, 'success');
                }
            }
        } catch (error) {
            console.error('Error exporting summary:', error);
            this.showToast(`❌ Export failed: ${error.message}`, 'error');
        }
    }

    async deleteSummary(id) {
        if (confirm('Are you sure you want to delete this summary?')) {
            try {
                await this.storage.deleteSummary(id);
                await this.loadSavedSummaries(); // Refresh the list
                this.showToast('✅ Summary deleted', 'success');
            } catch (error) {
                console.error('Error deleting summary:', error);
                this.showToast(`❌ Error deleting summary: ${error.message}`, 'error');
            }
        }
    }

    // Search functionality
    async searchSummaries(query) {
        const listContainer = document.getElementById('savedSummariesList');
        
        if (!query.trim()) {
            await this.loadSavedSummaries();
            return;
        }

        try {
            const results = await this.storage.searchSummaries(query);
            
            if (results.length === 0) {
                listContainer.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: #6c757d;">
                        <div style="font-size: 48px; margin-bottom: 16px;">🔍</div>
                        <p>No summaries found for "${query}"</p>
                    </div>
                `;
                return;
            }

            listContainer.innerHTML = results.map(summary => this.createSummaryListItem(summary)).join('');

        } catch (error) {
            console.error('Error searching summaries:', error);
            this.showToast(`❌ Search error: ${error.message}`, 'error');
        }
    }

    // Settings management
    async loadSettings() {
        try {
            const settings = await this.storage.getUserSettings();
            
            // Set default summary type
            const defaultType = document.getElementById('defaultSummaryType');
            if (defaultType) {
                defaultType.value = settings.defaultSummaryType;
            }

            // Set auto-save
            this.autoSaveEnabled = settings.autoSave;
            const autoSaveCheckbox = document.getElementById('autoSaveEnabled');
            if (autoSaveCheckbox) {
                autoSaveCheckbox.checked = this.autoSaveEnabled;
            }

            // Update auto-save button
            const autoSaveToggle = document.getElementById('autoSaveToggle');
            if (autoSaveToggle) {
                autoSaveToggle.textContent = `💾 Auto-save: ${this.autoSaveEnabled ? 'ON' : 'OFF'}`;
                autoSaveToggle.classList.toggle('btn-primary', this.autoSaveEnabled);
                autoSaveToggle.classList.toggle('btn-secondary', !this.autoSaveEnabled);
            }

        } catch (error) {
            console.error('Error loading settings:', error);
        }
    }

    async saveSettings() {
        try {
            const settings = {
                defaultSummaryType: document.getElementById('defaultSummaryType')?.value || 'bullet-points',
                autoSave: document.getElementById('autoSaveEnabled')?.checked || false,
                exportFormat: 'markdown',
                maxSummaries: 50
            };

            await this.storage.updateUserSettings(settings);
            this.autoSaveEnabled = settings.autoSave;

            // Update auto-save toggle button
            const autoSaveToggle = document.getElementById('autoSaveToggle');
            if (autoSaveToggle) {
                autoSaveToggle.textContent = `💾 Auto-save: ${this.autoSaveEnabled ? 'ON' : 'OFF'}`;
                autoSaveToggle.classList.toggle('btn-primary', this.autoSaveEnabled);
                autoSaveToggle.classList.toggle('btn-secondary', !this.autoSaveEnabled);
            }

        } catch (error) {
            console.error('Error saving settings:', error);
        }
    }

    // Data management
    async exportAllData() {
        try {
            const allData = await this.storage.exportAllData();
            const fileName = `yt-summarizer-backup-${Date.now()}.json`;
            
            const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            URL.revokeObjectURL(url);
            
            this.showToast(`✅ Data exported as ${fileName}`, 'success');

        } catch (error) {
            console.error('Error exporting data:', error);
            this.showToast(`❌ Export failed: ${error.message}`, 'error');
        }
    }

    async clearAllData() {
        const confirmed = confirm(
            'Are you sure you want to clear all data?\n\nThis will delete:\n- All saved summaries\n- All settings\n- Usage history\n\nThis action cannot be undone!'
        );

        if (confirmed) {
            try {
                await this.storage.clearAllData();
                await chrome.storage.local.clear(); // Clear everything
                
                this.showToast('✅ All data cleared', 'success');
                
                // Reset UI
                this.currentSummary = null;
                this.currentVideoInfo = null;
                document.getElementById('output').style.display = 'none';
                await this.loadSavedSummaries();
                await this.loadSettings();

            } catch (error) {
                console.error('Error clearing data:', error);
                this.showToast(`❌ Clear failed: ${error.message}`, 'error');
            }
        }
    }

    // UI helpers
    showUpgradePrompt() {
        const outputDiv = document.getElementById('output');
        const summaryContent = document.getElementById('summaryContent');
        
        outputDiv.style.display = 'block';
        summaryContent.innerHTML = `
            <div style="text-align: center; padding: 30px;">
                <div style="font-size: 48px; margin-bottom: 20px;">⚠️</div>
                <h3 style="color: #333; margin-bottom: 10px;">Daily Limit Reached</h3>
                <p style="color: #666; margin-bottom: 20px;">
                    You've used all 3 free summaries today.<br>
                    Upgrade to Pro for unlimited access!
                </p>
                <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                    <h4 style="color: #333; margin-bottom: 10px;">🎯 Pro Features:</h4>
                    <ul style="text-align: left; color: #666; font-size: 14px;">
                        <li>Unlimited summaries</li>
                        <li>All summary formats</li>
                        <li>Export to PDF/MD</li>
                        <li>Batch processing</li>
                        <li>Priority support</li>
                    </ul>
                </div>
                <button onclick="popupManager.openPaymentPage()" 
                        style="background: linear-gradient(45deg, #667eea, #764ba2); color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; font-weight: 600;">
                    Upgrade to Pro - ₹199
                </button>
            </div>
        `;
    }

    showToast(message, type = 'info') {
        // Create toast element
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 6px;
            color: white;
            font-weight: 600;
            z-index: 10000;
            max-width: 300px;
            opacity: 0;
            transform: translateX(100%);
            transition: all 0.3s ease;
        `;

        // Set color based on type
        const colors = {
            success: '#28a745',
            error: '#dc3545',
            warning: '#ffc107',
            info: '#17a2b8'
        };

        toast.style.background = colors[type] || colors.info;
        toast.textContent = message;

        document.body.appendChild(toast);

        // Show toast
        setTimeout(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(0)';
        }, 100);

        // Hide toast after 3 seconds
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => document.body.removeChild(toast), 300);
        }, 3000);
    }

    updateUI() {
        // Update status indicator
        const statusIndicator = document.getElementById('statusIndicator');
        if (navigator.onLine) {
            statusIndicator.classList.remove('offline');
            statusIndicator.title = 'Online';
        } else {
            statusIndicator.classList.add('offline');
            statusIndicator.title = 'Offline';
        }

        // Update summary type selection
        this.updateSummaryTypeSelection();
    }

    // Payment integration
    async openPaymentPage() {
        try {
            // This would integrate with your existing payment system
            chrome.runtime.sendMessage({ action: "openPayment" });
        } catch (error) {
            console.error('Payment error:', error);
            this.showToast('❌ Payment system error', 'error');
        }
    }

    // Keyboard shortcuts
    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + Enter to generate summary
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                this.generateSummary();
            }

            // Ctrl/Cmd + S to save current summary
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                this.saveCurrentSummary();
            }

            // Escape to close modals or clear search
            if (e.key === 'Escape') {
                const searchBox = document.getElementById('searchBox');
                if (searchBox && searchBox.value) {
                    searchBox.value = '';
                    this.loadSavedSummaries();
                }
            }
        });
    }

    // Offline functionality
    async handleOfflineMode() {
        if (!navigator.onLine) {
            // Show offline indicator
            this.updateUI();
            
            // Disable features that require internet
            const summarizeBtn = document.getElementById('summarizeBtn');
            if (summarizeBtn) {
                summarizeBtn.disabled = true;
                summarizeBtn.textContent = '🔌 Offline Mode';
            }

            // Show offline message
            this.showToast('📴 Offline mode - some features disabled', 'warning');
        }
    }

    // Analytics and usage tracking
    async trackUsage(action, data = {}) {
        try {
            const usageData = {
                action,
                timestamp: new Date().toISOString(),
                ...data
            };

            // Store usage data locally
            const existingUsage = await chrome.storage.local.get(['usage_analytics']);
            const analytics = existingUsage.usage_analytics || [];
            
            analytics.push(usageData);
            
            // Keep only last 100 entries
            if (analytics.length > 100) {
                analytics.splice(0, analytics.length - 100);
            }

            await chrome.storage.local.set({ usage_analytics: analytics });

        } catch (error) {
            console.error('Analytics error:', error);
        }
    }
}

// Initialize popup manager when DOM is loaded
let popupManager;

document.addEventListener('DOMContentLoaded', () => {
    popupManager = new PopupManager();

    // Setup keyboard shortcuts
    popupManager.setupKeyboardShortcuts();

    // Handle online/offline events
    window.addEventListener('online', () => popupManager.updateUI());
    window.addEventListener('offline', () => popupManager.handleOfflineMode());

    // Track popup open
    popupManager.trackUsage('popup_opened');
});

// Expose globally for HTML onclick handlers
window.popupManager = popupManager;