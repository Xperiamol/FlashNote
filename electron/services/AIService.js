/**
 * AI服务 - 管理AI配置和提供统一的AI调用接口
 * 支持多个AI服务提供商(OpenAI、DeepSeek、通义千问等)
 */

const { EventEmitter } = require('events');

class AIService extends EventEmitter {
  constructor(settingDAO) {
    super();
    this.settingDAO = settingDAO;
    this.initialized = false;
  }

  /**
   * 初始化AI服务
   */
  async initialize() {
    try {
      // 确保必要的设置键存在
      this.ensureDefaultSettings();
      this.initialized = true;
      console.log('AI Service initialized');
      return { success: true };
    } catch (error) {
      console.error('Failed to initialize AI Service:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 确保默认设置存在
   */
  ensureDefaultSettings() {
    const defaults = [
      { key: 'ai_enabled', value: 'false', type: 'boolean', description: 'AI功能开关' },
      { key: 'ai_provider', value: 'openai', type: 'string', description: 'AI服务提供商' },
      { key: 'ai_api_key', value: '', type: 'string', description: 'AI API密钥' },
      { key: 'ai_api_url', value: '', type: 'string', description: '自定义API地址' },
      { key: 'ai_model', value: 'gpt-3.5-turbo', type: 'string', description: 'AI模型' },
      { key: 'ai_temperature', value: '0.7', type: 'number', description: '温度参数' },
      { key: 'ai_max_tokens', value: '2000', type: 'number', description: '最大token数' }
    ];

    defaults.forEach(({ key, value, type, description }) => {
      const existing = this.settingDAO.get(key);
      if (!existing) {
        this.settingDAO.set(key, value, type, description);
      }
    });
  }

  /**
   * 获取AI配置
   */
  async getConfig() {
    try {
      // 使用 SettingDAO.get() 方法，返回 { key, value, type, description } 或 null
      // 注意：SettingDAO.get() 已经调用了 parseValue，所以 value 是解析后的类型
      const enabledSetting = this.settingDAO.get('ai_enabled');
      const providerSetting = this.settingDAO.get('ai_provider');
      const apiKeySetting = this.settingDAO.get('ai_api_key');
      const apiUrlSetting = this.settingDAO.get('ai_api_url');
      const modelSetting = this.settingDAO.get('ai_model');
      const temperatureSetting = this.settingDAO.get('ai_temperature');
      const maxTokensSetting = this.settingDAO.get('ai_max_tokens');

      const config = {
        enabled: enabledSetting ? enabledSetting.value : false,
        provider: providerSetting ? providerSetting.value : 'openai',
        apiKey: apiKeySetting ? apiKeySetting.value : '',
        apiUrl: apiUrlSetting ? apiUrlSetting.value : '',
        model: modelSetting ? modelSetting.value : 'gpt-3.5-turbo',
        temperature: temperatureSetting ? temperatureSetting.value : 0.7,
        maxTokens: maxTokensSetting ? maxTokensSetting.value : 2000
      };

      return {
        success: true,
        data: config
      };
    } catch (error) {
      console.error('Failed to get AI config:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 保存AI配置
   */
  async saveConfig(config) {
    try {
      const { enabled, provider, apiKey, apiUrl, model, temperature, maxTokens } = config;

      // 使用 SettingDAO.set() 方法，让DAO自己处理类型转换
      this.settingDAO.set('ai_enabled', enabled, 'boolean', 'AI功能开关');
      this.settingDAO.set('ai_provider', provider, 'string', 'AI服务提供商');
      this.settingDAO.set('ai_api_key', apiKey, 'string', 'AI API密钥');
      this.settingDAO.set('ai_api_url', apiUrl || '', 'string', '自定义API地址');
      this.settingDAO.set('ai_model', model, 'string', 'AI模型');
      this.settingDAO.set('ai_temperature', temperature, 'number', '温度参数');
      this.settingDAO.set('ai_max_tokens', maxTokens, 'number', '最大token数');

      // 触发配置更改事件
      this.emit('config-changed', config);

      return {
        success: true,
        message: '配置已保存'
      };
    } catch (error) {
      console.error('Failed to save AI config:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 测试AI连接
   */
  async testConnection(config) {
    try {
      const { provider, apiKey, apiUrl, model } = config;

      if (!apiKey) {
        return {
          success: false,
          error: '请先配置API密钥'
        };
      }

      // 根据不同的提供商测试连接
      let testResult;
      switch (provider) {
        case 'openai':
          testResult = await this.testOpenAI(apiKey, model);
          break;
        case 'deepseek':
          testResult = await this.testDeepSeek(apiKey, model);
          break;
        case 'qwen':
          testResult = await this.testQwen(apiKey, model);
          break;
        case 'custom':
          testResult = await this.testCustom(apiUrl, apiKey, model);
          break;
        default:
          return {
            success: false,
            error: '不支持的AI提供商'
          };
      }

      return testResult;
    } catch (error) {
      console.error('Failed to test AI connection:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 测试OpenAI连接
   */
  async testOpenAI(apiKey, model) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model || 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 10
        })
      });

      if (response.ok) {
        return {
          success: true,
          message: 'OpenAI连接测试成功'
        };
      } else {
        const error = await response.json();
        return {
          success: false,
          error: error.error?.message || '连接失败'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 测试DeepSeek连接
   */
  async testDeepSeek(apiKey, model) {
    try {
      const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model || 'deepseek-chat',
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 10
        })
      });

      if (response.ok) {
        return {
          success: true,
          message: 'DeepSeek连接测试成功'
        };
      } else {
        const error = await response.json();
        return {
          success: false,
          error: error.error?.message || '连接失败'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 测试通义千问连接
   */
  async testQwen(apiKey, model) {
    try {
      const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model || 'qwen-turbo',
          input: {
            messages: [{ role: 'user', content: 'Hello' }]
          },
          parameters: {
            max_tokens: 10
          }
        })
      });

      if (response.ok) {
        return {
          success: true,
          message: '通义千问连接测试成功'
        };
      } else {
        const error = await response.json();
        return {
          success: false,
          error: error.message || '连接失败'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 测试自定义API连接
   */
  async testCustom(apiUrl, apiKey, model) {
    try {
      if (!apiUrl) {
        return {
          success: false,
          error: '请先配置自定义API地址'
        };
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: model || 'gpt-3.5-turbo',
          messages: [{ role: 'user', content: 'Hello' }],
          max_tokens: 10
        })
      });

      if (response.ok) {
        return {
          success: true,
          message: '自定义API连接测试成功'
        };
      } else {
        const error = await response.json();
        return {
          success: false,
          error: error.error?.message || error.message || '连接失败'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 获取支持的AI提供商列表
   */
  getProviders() {
    return {
      success: true,
      data: [
        {
          id: 'openai',
          name: 'OpenAI',
          description: 'ChatGPT, GPT-4等模型',
          models: ['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo'],
          requiresApiKey: true,
          requiresApiUrl: false
        },
        {
          id: 'deepseek',
          name: 'DeepSeek',
          description: '深度求索AI模型',
          models: ['deepseek-chat', 'deepseek-coder'],
          requiresApiKey: true,
          requiresApiUrl: false
        },
        {
          id: 'qwen',
          name: '通义千问',
          description: '阿里云通义千问系列模型',
          models: ['qwen-turbo', 'qwen-plus', 'qwen-max'],
          requiresApiKey: true,
          requiresApiUrl: false
        },
        {
          id: 'custom',
          name: '自定义',
          description: '兼容OpenAI API格式的自定义服务',
          models: [],
          requiresApiKey: true,
          requiresApiUrl: true
        }
      ]
    };
  }

  /**
   * 调用AI完成任务（供后续功能使用）
   */
  async chat(messages, options = {}) {
    try {
      const configResult = await this.getConfig();
      if (!configResult.success) {
        return configResult;
      }

      const config = configResult.data;
      
      if (!config.enabled) {
        return {
          success: false,
          error: 'AI功能未启用'
        };
      }

      if (!config.apiKey) {
        return {
          success: false,
          error: '请先配置API密钥'
        };
      }

      // 根据提供商调用相应的API
      let result;
      switch (config.provider) {
        case 'openai':
          result = await this.chatOpenAI(config, messages, options);
          break;
        case 'deepseek':
          result = await this.chatDeepSeek(config, messages, options);
          break;
        case 'qwen':
          result = await this.chatQwen(config, messages, options);
          break;
        case 'custom':
          result = await this.chatCustom(config, messages, options);
          break;
        default:
          return {
            success: false,
            error: '不支持的AI提供商'
          };
      }

      return result;
    } catch (error) {
      console.error('AI chat failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * OpenAI聊天
   */
  async chatOpenAI(config, messages, options = {}) {
    // OpenAI 温度范围是 [0, 2]
    const temperature = options.temperature || config.temperature
    const validTemperature = Math.min(Math.max(temperature, 0), 2)
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: messages,
        temperature: validTemperature,
        max_tokens: options.maxTokens || config.maxTokens
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || '请求失败');
    }

    const data = await response.json();
    return {
      success: true,
      data: {
        content: data.choices[0].message.content,
        usage: data.usage
      }
    };
  }

  /**
   * DeepSeek聊天
   */
  async chatDeepSeek(config, messages, options = {}) {
    // DeepSeek 温度范围是 [0, 2]，需要限制
    const temperature = options.temperature || config.temperature
    const validTemperature = Math.min(Math.max(temperature, 0), 2)
    
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: messages,
        temperature: validTemperature,
        max_tokens: options.maxTokens || config.maxTokens
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || '请求失败');
    }

    const data = await response.json();
    return {
      success: true,
      data: {
        content: data.choices[0].message.content,
        usage: data.usage
      }
    };
  }

  /**
   * 通义千问聊天
   */
  async chatQwen(config, messages, options = {}) {
    // 通义千问温度范围是 [0, 2]
    const temperature = options.temperature || config.temperature
    const validTemperature = Math.min(Math.max(temperature, 0), 2)
    
    const response = await fetch('https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        input: { messages },
        parameters: {
          temperature: validTemperature,
          max_tokens: options.maxTokens || config.maxTokens
        }
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || '请求失败');
    }

    const data = await response.json();
    return {
      success: true,
      data: {
        content: data.output.text,
        usage: data.usage
      }
    };
  }

  /**
   * 自定义API聊天
   */
  async chatCustom(config, messages, options = {}) {
    // 自定义 API 也限制在 [0, 2] 范围内以保证兼容性
    const temperature = options.temperature || config.temperature
    const validTemperature = Math.min(Math.max(temperature, 0), 2)
    
    const response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: messages,
        temperature: validTemperature,
        max_tokens: options.maxTokens || config.maxTokens
      })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || error.message || '请求失败');
    }

    const data = await response.json();
    return {
      success: true,
      data: {
        content: data.choices[0].message.content,
        usage: data.usage
      }
    };
  }
}

module.exports = AIService;
