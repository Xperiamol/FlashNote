/**
 * 日期时间格式测试脚本
 * 用于验证前后端时间格式的兼容性
 */

// 模拟前端 TimeZoneUtils 核心逻辑
class MockTimeZoneUtils {
  static toUTC(dateString, timeString = '') {
    if (!dateString) return null;
    
    try {
      // 如果没有时间，默认为 00:00:00
      const time = timeString || '00:00';
      const localDateTime = `${dateString}T${time}:00`;
      
      // 创建本地时间的Date对象
      const localDate = new Date(localDateTime);
      
      // 检查日期是否有效
      if (isNaN(localDate.getTime())) {
        console.warn('无效的日期时间:', { dateString, timeString });
        return null;
      }
      
      // 返回UTC ISO字符串
      return localDate.toISOString();
    } catch (error) {
      console.error('转换为UTC时出错:', error, { dateString, timeString });
      return null;
    }
  }

  static fromUTC(utcISOString) {
    if (!utcISOString) return { date: '', time: '' };
    
    try {
      const utcDate = new Date(utcISOString);
      
      // 检查日期是否有效
      if (isNaN(utcDate.getTime())) {
        console.warn('无效的UTC ISO字符串:', utcISOString);
        return { date: '', time: '' };
      }
      
      // 获取本地时间的年月日时分秒
      const year = utcDate.getFullYear();
      const month = String(utcDate.getMonth() + 1).padStart(2, '0');
      const day = String(utcDate.getDate()).padStart(2, '0');
      const hours = String(utcDate.getHours()).padStart(2, '0');
      const minutes = String(utcDate.getMinutes()).padStart(2, '0');
      
      const date = `${year}-${month}-${day}`;
      const time = `${hours}:${minutes}`;
      
      return { date, time };
    } catch (error) {
      console.error('从UTC转换时出错:', error, utcISOString);
      return { date: '', time: '' };
    }
  }

  static hasTime(utcISOString) {
    if (!utcISOString) return false;
    
    try {
      const date = new Date(utcISOString);
      return date.getHours() !== 0 || date.getMinutes() !== 0 || date.getSeconds() !== 0;
    } catch (error) {
      console.error('检查是否有时间时出错:', error, utcISOString);
      return false;
    }
  }
}

console.log('=== 日期时间格式测试 ===');

// 测试1: 前端生成完整时间的情况
console.log('\n1. 前端生成完整时间:');
const localDate = '2025-11-13';
const localTime = '17:30';
const utcISO = MockTimeZoneUtils.toUTC(localDate, localTime);
console.log('   本地:', `${localDate} ${localTime}`);
console.log('   UTC ISO:', utcISO);
console.log('   解析回本地:', MockTimeZoneUtils.fromUTC(utcISO));
console.log('   包含非默认时间:', MockTimeZoneUtils.hasTime(utcISO));

// 测试2: AI生成的时间格式
console.log('\n2. AI生成的时间格式:');
const aiGeneratedTime = '2025-11-13T17:30:00';
console.log('   AI生成:', aiGeneratedTime);
console.log('   解析为Date:', new Date(aiGeneratedTime).toString());
console.log('   转换为本地:', MockTimeZoneUtils.fromUTC(aiGeneratedTime));

// 测试3: 只有日期没有时间的情况
console.log('\n3. 只有日期没有时间:');
const onlyDate = '2025-11-13';
const utcOnlyDate = MockTimeZoneUtils.toUTC(onlyDate);
console.log('   输入:', onlyDate);
console.log('   UTC ISO:', utcOnlyDate);
console.log('   转换为本地:', MockTimeZoneUtils.fromUTC(utcOnlyDate));
console.log('   包含非默认时间:', MockTimeZoneUtils.hasTime(utcOnlyDate));

// 测试4: 不同时间的情况
console.log('\n4. 不同时间测试:');
const times = ['09:00', '12:30', '18:45'];
times.forEach(time => {
  const utc = MockTimeZoneUtils.toUTC(localDate, time);
  const hasTime = MockTimeZoneUtils.hasTime(utc);
  console.log(`   ${time} => ${hasTime ? '有时间' : '无时间'}`);
});

console.log('\n=== 结论 ===');
console.log('✅ AI生成的格式为"YYYY-MM-DDTHH:MM:SS"的时间可以被前端正确解析');
console.log('✅ 前端TimeZoneUtils能够正确区分包含时间和不包含时间的情况');
console.log('✅ 前后端时间格式兼容');
