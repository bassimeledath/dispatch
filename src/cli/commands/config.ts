import * as output from '../../utils/output.js';
import { getConfig, setConfigValue } from '../../core/config.js';

export async function configCommand(action: string, key?: string, value?: string): Promise<void> {
  if (action === 'list') {
    const config = getConfig();
    output.header('Manager Config');
    const rows: string[][] = [['Key', 'Value']];
    rows.push(['engine', config.engine]);
    rows.push(['models.quick', config.models.quick]);
    rows.push(['models.s1', config.models.s1]);
    rows.push(['models.s2', config.models.s2]);
    rows.push(['models.reviewer', config.models.reviewer]);
    output.table(rows);
    return;
  }

  if (action === 'get') {
    if (!key) {
      output.error('Usage: manager config get <key>');
      process.exit(1);
    }
    const config = getConfig();
    const parts = key.split('.');
    if (parts.length === 2 && parts[0] === 'models') {
      const v = config.models[parts[1] as keyof typeof config.models];
      if (v !== undefined) {
        console.log(v);
        return;
      }
    } else if (parts.length === 1 && parts[0] === 'engine') {
      console.log(config.engine);
      return;
    }
    output.error(`Unknown key: ${key}`);
    process.exit(1);
  }

  if (action === 'set') {
    if (!key || !value) {
      output.error('Usage: manager config set <key> <value>');
      process.exit(1);
    }
    try {
      setConfigValue(key, value);
      output.ok(`Set ${key} = ${value}`);
    } catch (err) {
      output.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
    return;
  }

  output.error(`Unknown config action: ${action}. Use list, get, or set.`);
  process.exit(1);
}
