const axios = require('axios');
const config = require('../config/config');
const logger = require('../utils/logger');

class AmoCrmService {
  /**
   * Universal helper to send authenticated requests to amoCRM REST API v4.
   * @param {string} endpoint - API path (e.g. '/api/v4/users')
   * @param {string} [method] - HTTP method (GET, POST, etc.)
   * @param {Object} [params] - Query parameters
   * @param {Object} [data] - JSON body payload
   * @returns {Promise<Object>} API response data
   */
  async sendRequest(endpoint, method = 'GET', params = {}, data = null) {
    const subdomain = config.AMO_SUBDOMAIN;
    const token = config.AMO_INTEGRATION_TOKEN;

    if (!subdomain) {
      throw new Error('Субдомен amoCRM не настроен в панели управления.');
    }
    if (!token) {
      throw new Error('Токен интеграции amoCRM не настроен в панели управления.');
    }

    // Clean subdomain (remove domain parts if the user entered full url)
    let cleanSubdomain = subdomain.trim();
    if (cleanSubdomain.includes('//')) {
      cleanSubdomain = cleanSubdomain.split('//')[1];
    }
    if (cleanSubdomain.includes('.')) {
      cleanSubdomain = cleanSubdomain.split('.')[0];
    }

    const url = `https://${cleanSubdomain}.amocrm.ru${endpoint}`;
    
    logger.info(`Sending ${method} request to amoCRM: ${url}`);

    const headers = {
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'Antigravity-CRM-Reporter/1.0',
      'Content-Type': 'application/json'
    };

    try {
      const response = await axios({
        url,
        method,
        headers,
        params,
        data,
        timeout: 20000 // 20s timeout
      });

      return response.data;
    } catch (error) {
      let errMsg = error.message;
      if (error.response && error.response.data) {
        const d = error.response.data;
        if (d.title || d.detail) {
          errMsg = `${d.title || ''}: ${d.detail || ''}`;
        } else {
          errMsg = JSON.stringify(d);
        }
      }
      logger.error(`amoCRM API error at ${endpoint}: ${errMsg}`);
      throw new Error(`Ошибка amoCRM API: ${errMsg}`);
    }
  }

  /**
   * Fetches all users registered in the amoCRM account.
   * @returns {Promise<Array>} List of user objects
   */
  async fetchUsers() {
    try {
      const data = await this.sendRequest('/api/v4/users');
      if (data && data._embedded && data._embedded.users) {
        return data._embedded.users;
      }
      return [];
    } catch (error) {
      logger.error(`Failed to fetch amoCRM users: ${error.message}`);
      throw error;
    }
  }

  /**
   * Fetches all open (incomplete) tasks with auto-pagination.
   * @returns {Promise<Array>} List of open task objects
   */
  async fetchTasks() {
    let tasks = [];
    let page = 1;
    let hasNext = true;

    try {
      while (hasNext) {
        logger.info(`Fetching amoCRM open tasks page ${page}...`);
        const data = await this.sendRequest('/api/v4/tasks', 'GET', {
          'filter[is_completed]': 0, // Incomplete tasks
          'limit': 250,
          'page': page
        });

        if (data && data._embedded && data._embedded.tasks && data._embedded.tasks.length > 0) {
          tasks = tasks.concat(data._embedded.tasks);
          // Standard v4 pagination links check
          if (data._links && data._links.next) {
            page++;
          } else {
            hasNext = false;
          }
        } else {
          hasNext = false;
        }
      }
      logger.info(`Successfully fetched ${tasks.length} total open tasks from amoCRM.`);
      return tasks;
    } catch (error) {
      // amoCRM returns 204 No Content (or sometimes empty payload) when no tasks exist
      if (error.message.includes('status code 204') || error.message.includes('204')) {
        logger.info('No open tasks found in amoCRM (204 No Content).');
        return [];
      }
      logger.error(`Failed to fetch amoCRM open tasks: ${error.message}`);
      throw error;
    }
  }

  /**
   * Fetches all events (actions log) for a specific period with auto-pagination.
   * @param {number} startTime - UNIX timestamp
   * @param {number} stopTime - UNIX timestamp
   * @returns {Promise<Array>} List of event objects
   */
  async fetchEventsForPeriod(startTime, stopTime) {
    let events = [];
    let page = 1;
    let hasNext = true;

    try {
      while (hasNext) {
        logger.info(`Fetching amoCRM events page ${page} from ${startTime} to ${stopTime}...`);
        const data = await this.sendRequest('/api/v4/events', 'GET', {
          'filter[created_at][from]': startTime,
          'filter[created_at][to]': stopTime,
          'limit': 250,
          'page': page
        });

        if (data && data._embedded && data._embedded.events && data._embedded.events.length > 0) {
          events = events.concat(data._embedded.events);
          if (data._links && data._links.next) {
            page++;
          } else {
            hasNext = false;
          }
        } else {
          hasNext = false;
        }
      }
      logger.info(`Successfully fetched ${events.length} total events from amoCRM.`);
      return events;
    } catch (error) {
      if (error.message.includes('204') || error.message.includes('No Content')) {
        logger.info('No events found in amoCRM for this period.');
        return [];
      }
      logger.error(`Failed to fetch amoCRM events: ${error.message}`);
      throw error;
    }
  }

  /**
   * Fetches all pipelines with their statuses from amoCRM.
   * @returns {Promise<Array>} List of pipelines
   */
  async fetchPipelines() {
    try {
      const data = await this.sendRequest('/api/v4/leads/pipelines');
      if (data && data._embedded && data._embedded.pipelines) {
        return data._embedded.pipelines;
      }
      return [];
    } catch (error) {
      logger.error(`Failed to fetch amoCRM pipelines: ${error.message}`);
      throw error;
    }
  }

  /**
   * Fetches all leads for a specific pipeline and status IDs with auto-pagination.
   * @param {number|string} pipelineId
   * @param {Array<number|string>} statusIds
   * @returns {Promise<Array>} List of lead objects
   */
  async fetchLeads(pipelineId, statusIds = []) {
    let leads = [];
    let page = 1;
    let hasNext = true;
    const limit = 250;

    try {
      while (hasNext) {
        logger.info(`Fetching amoCRM leads page ${page} for pipeline ${pipelineId}...`);
        
        let params = {
          limit,
          page,
          with: 'contacts'
        };

        if (statusIds && statusIds.length > 0) {
          statusIds.forEach((statusId, index) => {
            params[`filter[statuses][${index}][pipeline_id]`] = pipelineId;
            params[`filter[statuses][${index}][status_id]`] = statusId;
          });
        } else {
          params['filter[pipeline_id]'] = pipelineId;
        }

        const data = await this.sendRequest('/api/v4/leads', 'GET', params);

        if (data && data._embedded && data._embedded.leads && data._embedded.leads.length > 0) {
          leads = leads.concat(data._embedded.leads);
          if (data._links && data._links.next) {
            page++;
          } else {
            hasNext = false;
          }
        } else {
          hasNext = false;
        }
        
        // Sleep a bit to avoid hitting rate limit (7 requests per second)
        await new Promise(resolve => setTimeout(resolve, 150));
      }
      logger.info(`Successfully fetched ${leads.length} leads.`);
      return leads;
    } catch (error) {
      if (error.message.includes('204') || error.message.includes('No Content')) {
        logger.info('No leads found for specified filters.');
        return [];
      }
      logger.error(`Failed to fetch amoCRM leads: ${error.message}`);
      throw error;
    }
  }

  /**
   * Fetches multiple contacts by their IDs in batches.
   * @param {Array<number|string>} contactIds
   * @returns {Promise<Array>} List of contact objects
   */
  async fetchContactsByIds(contactIds) {
    if (!contactIds || contactIds.length === 0) return [];
    
    // De-duplicate contact IDs
    const uniqueIds = Array.from(new Set(contactIds));
    let contacts = [];
    const batchSize = 100;

    try {
      for (let i = 0; i < uniqueIds.length; i += batchSize) {
        const batch = uniqueIds.slice(i, i + batchSize);
        logger.info(`Fetching batch of ${batch.length} contacts from amoCRM...`);
        
        let params = {
          limit: batchSize
        };
        batch.forEach((id, index) => {
          params[`filter[id][${index}]`] = id;
        });

        const data = await this.sendRequest('/api/v4/contacts', 'GET', params);

        if (data && data._embedded && data._embedded.contacts) {
          contacts = contacts.concat(data._embedded.contacts);
        }

        // Slight sleep to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 150));
      }

      logger.info(`Successfully fetched ${contacts.length} contacts details.`);
      return contacts;
    } catch (error) {
      if (error.message.includes('204') || error.message.includes('No Content')) {
        return [];
      }
      logger.error(`Failed to fetch contacts by IDs: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new AmoCrmService();
