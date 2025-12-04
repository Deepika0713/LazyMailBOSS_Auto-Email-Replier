// API Client
class ApiClient {
    constructor(baseUrl = '/api') {
        this.baseUrl = baseUrl;
    }

    async request(endpoint, options = {}) {
        const url = `${this.baseUrl}${endpoint}`;
        const config = {
            headers: {
                'Content-Type': 'application/json',
                ...options.headers
            },
            ...options
        };

        try {
            const response = await fetch(url, config);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Request failed');
            }

            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    }

    async getStatus() {
        return this.request('/status');
    }

    async getConfig() {
        return this.request('/config');
    }

    async updateConfig(config) {
        return this.request('/config', {
            method: 'PUT',
            body: JSON.stringify(config)
        });
    }

    async getLogs(limit = 100, offset = 0) {
        return this.request(`/logs?limit=${limit}&offset=${offset}`);
    }

    async getPendingReplies() {
        return this.request('/pending-replies');
    }

    async approveReply(replyId) {
        return this.request(`/replies/${replyId}/approve`, {
            method: 'POST',
            body: JSON.stringify({ approvedBy: 'user' })
        });
    }

    async rejectReply(replyId) {
        return this.request(`/replies/${replyId}/reject`, {
            method: 'POST'
        });
    }
}

// Dashboard Application
class Dashboard {
    constructor() {
        this.api = new ApiClient();
        this.currentPage = 0;
        this.logsPerPage = 20;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadStatus();
        this.loadConfig();
        this.loadPendingReplies();
        this.loadActivityLogs();

        // Auto-refresh status and pending replies every 10 seconds
        setInterval(() => {
            this.loadStatus();
            this.loadPendingReplies();
        }, 10000);
    }

    setupEventListeners() {
        // Config form
        document.getElementById('config-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveConfig();
        });

        document.getElementById('reload-config').addEventListener('click', () => {
            this.loadConfig();
        });

        // Activity log pagination
        document.getElementById('refresh-logs').addEventListener('click', () => {
            this.currentPage = 0;
            this.loadActivityLogs();
        });

        document.getElementById('prev-page').addEventListener('click', () => {
            if (this.currentPage > 0) {
                this.currentPage--;
                this.loadActivityLogs();
            }
        });

        document.getElementById('next-page').addEventListener('click', () => {
            this.currentPage++;
            this.loadActivityLogs();
        });
    }

    async loadStatus() {
        try {
            const status = await this.api.getStatus();
            
            const monitoringEl = document.getElementById('monitoring-status');
            monitoringEl.textContent = status.monitoring ? 'Active' : 'Inactive';
            monitoringEl.className = `status-value ${status.monitoring ? 'active' : 'inactive'}`;

            const modeEl = document.getElementById('confirmation-mode');
            modeEl.textContent = status.manualConfirmationEnabled ? 'Manual' : 'Automatic';

            document.getElementById('pending-count').textContent = status.pendingRepliesCount;
            document.getElementById('sent-count').textContent = status.totalRepliesSent;
        } catch (error) {
            console.error('Failed to load status:', error);
        }
    }

    async loadConfig() {
        try {
            const config = await this.api.getConfig();
            
            // Email settings
            document.getElementById('imap-host').value = config.email.imapHost || '';
            document.getElementById('imap-port').value = config.email.imapPort || '';
            document.getElementById('smtp-host').value = config.email.smtpHost || '';
            document.getElementById('smtp-port').value = config.email.smtpPort || '';
            document.getElementById('username').value = config.email.username || '';
            document.getElementById('password').value = ''; // Never populate password

            // Filter settings
            document.getElementById('keywords-enabled').checked = config.filters.keywordsEnabled || false;
            document.getElementById('keywords').value = (config.filters.keywords || []).join(', ');
            document.getElementById('excluded-domains').value = (config.filters.excludedDomains || []).join(', ');

            // Auto-reply settings
            document.getElementById('manual-confirmation').checked = config.autoReply.manualConfirmation || false;
            document.getElementById('reply-template').value = config.autoReply.replyTemplate || '';
            document.getElementById('check-interval').value = config.autoReply.checkInterval || 10;

            this.showMessage('config-message', 'Configuration loaded', 'success');
            setTimeout(() => this.hideMessage('config-message'), 3000);
        } catch (error) {
            console.error('Failed to load config:', error);
            this.showMessage('config-message', 'Failed to load configuration: ' + error.message, 'error');
        }
    }

    async saveConfig() {
        try {
            const formData = new FormData(document.getElementById('config-form'));
            
            // Parse keywords and domains
            const keywords = formData.get('keywords')
                .split(',')
                .map(k => k.trim())
                .filter(k => k.length > 0);
            
            const excludedDomains = formData.get('excludedDomains')
                .split(',')
                .map(d => d.trim())
                .filter(d => d.length > 0);

            const config = {
                email: {
                    imapHost: formData.get('imapHost'),
                    imapPort: parseInt(formData.get('imapPort')),
                    smtpHost: formData.get('smtpHost'),
                    smtpPort: parseInt(formData.get('smtpPort')),
                    username: formData.get('username')
                },
                filters: {
                    keywordsEnabled: formData.get('keywordsEnabled') === 'on',
                    keywords,
                    excludedDomains
                },
                autoReply: {
                    manualConfirmation: formData.get('manualConfirmation') === 'on',
                    replyTemplate: formData.get('replyTemplate'),
                    checkInterval: parseInt(formData.get('checkInterval'))
                }
            };

            // Only include password if it was changed
            const password = formData.get('password');
            if (password && password.trim() !== '') {
                config.email.password = password;
            }

            await this.api.updateConfig(config);
            this.showMessage('config-message', 'Configuration saved successfully!', 'success');
            
            // Reload status to reflect changes
            setTimeout(() => {
                this.loadStatus();
                this.hideMessage('config-message');
            }, 2000);
        } catch (error) {
            console.error('Failed to save config:', error);
            this.showMessage('config-message', 'Failed to save configuration: ' + error.message, 'error');
        }
    }

    async loadPendingReplies() {
        try {
            const data = await this.api.getPendingReplies();
            const container = document.getElementById('pending-replies-list');

            if (data.replies.length === 0) {
                container.innerHTML = '<p class="empty-state">No pending replies</p>';
                return;
            }

            container.innerHTML = data.replies.map(reply => `
                <div class="reply-item" data-reply-id="${reply.id}">
                    <div class="reply-header">
                        <div class="reply-info">
                            <div class="reply-to">To: ${this.escapeHtml(reply.to)}</div>
                            <div class="reply-subject">Subject: ${this.escapeHtml(reply.subject)}</div>
                        </div>
                    </div>
                    <div class="reply-body">${this.escapeHtml(reply.body)}</div>
                    <div class="reply-actions">
                        <button class="btn btn-success" onclick="dashboard.approveReply('${reply.id}')">
                            Approve & Send
                        </button>
                        <button class="btn btn-danger" onclick="dashboard.rejectReply('${reply.id}')">
                            Reject
                        </button>
                    </div>
                </div>
            `).join('');
        } catch (error) {
            console.error('Failed to load pending replies:', error);
        }
    }

    async approveReply(replyId) {
        try {
            await this.api.approveReply(replyId);
            await this.loadPendingReplies();
            await this.loadStatus();
            await this.loadActivityLogs();
        } catch (error) {
            console.error('Failed to approve reply:', error);
            alert('Failed to approve reply: ' + error.message);
        }
    }

    async rejectReply(replyId) {
        try {
            await this.api.rejectReply(replyId);
            await this.loadPendingReplies();
            await this.loadStatus();
            await this.loadActivityLogs();
        } catch (error) {
            console.error('Failed to reject reply:', error);
            alert('Failed to reject reply: ' + error.message);
        }
    }

    async loadActivityLogs() {
        try {
            const offset = this.currentPage * this.logsPerPage;
            const data = await this.api.getLogs(this.logsPerPage, offset);
            const container = document.getElementById('activity-log-list');

            if (data.logs.length === 0) {
                if (this.currentPage === 0) {
                    container.innerHTML = '<p class="empty-state">No activity logs yet</p>';
                } else {
                    // No more logs, go back a page
                    this.currentPage--;
                    return;
                }
            } else {
                container.innerHTML = data.logs.map(log => `
                    <div class="log-item ${log.type}">
                        <div class="log-header">
                            <span class="log-type">${this.formatLogType(log.type)}</span>
                            <span class="log-timestamp">${this.formatTimestamp(log.timestamp)}</span>
                        </div>
                        <div class="log-details">${this.escapeHtml(log.details)}</div>
                        <div class="log-email-id">Email ID: ${this.escapeHtml(log.emailId)}</div>
                    </div>
                `).join('');
            }

            // Update pagination controls
            document.getElementById('page-info').textContent = `Page ${this.currentPage + 1}`;
            document.getElementById('prev-page').disabled = this.currentPage === 0;
            document.getElementById('next-page').disabled = data.logs.length < this.logsPerPage;
        } catch (error) {
            console.error('Failed to load activity logs:', error);
        }
    }

    formatLogType(type) {
        return type.replace(/_/g, ' ');
    }

    formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        return date.toLocaleString();
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    showMessage(elementId, message, type) {
        const el = document.getElementById(elementId);
        el.textContent = message;
        el.className = `message ${type}`;
    }

    hideMessage(elementId) {
        const el = document.getElementById(elementId);
        el.className = 'message';
    }
}

// Initialize dashboard when DOM is ready
let dashboard;
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        dashboard = new Dashboard();
    });
} else {
    dashboard = new Dashboard();
}
