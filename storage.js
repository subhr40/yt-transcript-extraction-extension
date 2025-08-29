/**
 * storage.js - storage management for storing summaries
 * Max SUmmaries: Limited to 100 to prevent storage overflow
 */

class SummaryStorage {
    constructor() {
        this.STORAGE_KEY = 'saved_summaries';
        this.SETTINGS_KEY = 'user_settings';
        this.MAX_SUMMARIES = '100'; 
    }

    // Save a new summary
    async saveSummary(summaryData) {
        try {
            const summaries = await this.getAllSummaries();

            const newSummary = {
                id: this.generateId(),
                title: summaryData.videoInfo?.title || 'Untitled Video',
                channel: summaryData.videoInfo?.channel || 'Unknown Channel',
                duration: summaryData.videoInfo?.duration || '',
                url: summaryData.videoUrl,
                summaryType: summaryData.summaryType,
                content: summaryData.content,
                transcript: summaryData.transcript, // Store for offline access
                tags: summaryData.tags || [],
                createdAt: new Date().toISOString(),
                lastAccessed: new Date().toISOString(),
                isFavorite: false
            };

            // Keeping only the most recent summaries
            if(summaries.length > this.MAX_SUMMARIES) {
                summaries.splice(this.MAX_SUMMARIES);
            }

            await chrome.storage.local.set({ [this.STORAGE_KEY]: summaries});
            return newSummary;
        } catch(error) {
            console.error(`Error saving summary: ${error}`);
            throw error;
        }
    }

    // Get all saved summaries
    async getAllSummaries() {
        try {
            const result = await chrome.storage.local.get([this.STORAGE_KEY]);
            return result[this.STORAGE_KEY] || [];
        } catch(error) {
            console.error(`Error retrieving summaries ${error}`);
            return [];
        }
    }

    // Get summary by ID
    async getSummaryById(id) {
        const summaries = await this.getAllSummaries();
        const summary = summaries.find(s => s.id === id);

        if(summary) {
            // Update last accessed time
            summary.lastAccessed = new Date().toISOString();
            await this.updateSummary(summary);
        }
    }

    // Update existing summary
    async updateSummary(summary) {
        const summaries = await this.getAllSummaries();
        const index = summaries.findIndex(s => s.id === this.updateSummary.id);

        if(index !== -1) {
            summaries[index] = updatedSummary;
            await chrome.storage.local.set({ [this.STORAGE_KEY]: summaries});
            return true;
        }
        return false;
    }

    // Search Summaries
    async searchSummaries(query, filters={}) {
        const summaries = await this.getAllSummaries();
        const lowercaseQuery = query.toLowerCase();

        return summaries.filter(summary => {
            // Text Search
            const matchesQuery = !query ||
                summary.title.toLowerCase().includes(lowercaseQuery) ||
                summary.channel.toLowerCase().includes(lowercaseQuery) ||
                summary.content.toLowerCase().includes(lowercaseQuery);
            
            // Filter by type
            const matchesType = !filters.summaryType ||
              summary.summaryType === filters.summaryType;

            // Filter by date range
            const matchesDate = !filters.dateRange ||
              this.isWithinDateRange(summary.createdAt, filters.dateRange);

            // Filter by favorites
            const matchesFavorite = !filters.favoritesOnly || summary.isFavorite;

            return matchesQuery && matchesType && matchesDate && matchesFavorite;
            });
    }

    // Delete Summary
    async deleteSummary(id) {
        const summaries = await this.getAllSummaries();
        const filteredSummaries = summaries.filter(s => s.id !== id);
        await chrome.storage.local.set({ [this.STORAGE_KEY]: filteredSummaries });
        return true;
    }

    // Toggle favorite status
    async toggleFavorite(id) {
        const summary = await this.getSummaryById(id);
        if(summary) {
            summary.isFavorite = !summary.isFavorite;
            await this.updateSummary(summary);
            return summary.isFavorite;
        }
        return false;
    }

    // Get Storage Stats
    async getStorageStats() {
        const summaries = await this.getAllSummaries();
        const totalSize = JSON.stringify(summaries).length;

        return {
            totalSummaries: summaries.length,
            storageUsedKB: Math.round(totalSize/1024),
            favoriteCount: summaries.filter(s => s.isFavorite).length,
            typeBreakdown: this.getTypeBreakdown(summaries)
        };
    }

    // User Settings
    async getUserSettings() {
        const result = await chrome.storage.local.get([this.SETTINGS_KEY]);
        return  {
            defaultSummaryType: 'bullet-points',
            autoSave: true,
            exportFormat: 'markdown',
            maxSummaries: 50,
            ...result[this.SETTINGS_KEY]
        };
    }

    async updateUserSettings(settings) {
        await chrome.storage.local.set({ [this.SETTINGS_KEY]: settings });
    }

    // Helper methods
    generateId() {
        return Date.now().toString(36) + Math.random().toString(36).substring(2);
    }

    extractVideoUrl() {
        if(!url) return null;
        const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/);
        return match ? match[1] : null;
    }

    isWithinDateRange(dateString, range) {
        const date = new Date(dateString);
        const now = new Date();

        switch(range) {
            case 'today':
                return date.toDateString() === now.toDateString();
            case 'week':
                const weekAgo = new Date(now.getTime() - 7*24*60*60*1000);
                return date >= weekAgo;
            case 'month':
                const monthAgo = new Date(now.getTime() - 30*24*60*60*1000);
                return date >= monthAgo;
            default:
                return true;
        }
    }

    getTypeBreakdown(summaries) {
        const breakdown = {};
        summaries.forEach(summary => {
            breakdown[summary.summaryType] = (breakdown[summary.summaryType] || 0) + 1;
        });
        return breakdown;
    }

    // Export data for backup
    async exportAllData() {
        const summaries = await this.getAllSummaries();
        const settings = await this.getUserSettings();

        return {
            summaries,
            settings,
            exportDate: new Date().toISOString(),
            version: "1.0"
        };
    }

    // Import Data from backup
    async importData(data) {
        if(data.summaries) {
            await chrome.storage.local.set({ [this.STORAGE_KEY]: data.summaries});
        }
        if(data.settings) {
            await chrome.storage.local.set({ [this.SETTINGS_KEY]: data.settings});
        }
    }

    // Clear all data
    async clearAllData() {
        await chrome.storage.local.remove([this.STORAGE_KEY, this.SETTINGS_KEY]);
    }
}

// Make available globally
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SummaryStorage;
} else {
    window.SummaryStorage = SummaryStorage;
}