import path from 'node:path';
import * as readline from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';
import {
  TEMPLATES,
  getTemplate,
  isDirectoryEmpty,
  createAgentFromTemplate,
} from '../templates/index.js';

/**
 * Logger utilities
 */
const logger = {
  info: (message: string) => console.log(`[INFO] ${message}`),
  success: (message: string) => console.log(`[SUCCESS] ${message}`),
  error: (message: string) => console.error(`[ERROR] ${message}`),
  divider: () => console.log('─'.repeat(60)),
};

/**
 * Prompt user to select a template from the list
 */
async function promptForTemplate(): Promise<string> {
  const rl = readline.createInterface({ input, output });

  return new Promise((resolve) => {
    logger.divider();
    logger.info('Available templates:');
    console.log();

    TEMPLATES.forEach((template, index) => {
      console.log(`  ${index + 1}. ${template.name.padEnd(15)} - ${template.description}`);
    });

    console.log();
    process.stdout.write('Select a template (1-4): ');

    rl.on('line', (line) => {
      const choice = parseInt(line.trim(), 10);
      if (choice >= 1 && choice <= TEMPLATES.length) {
        rl.close();
        const selectedTemplate = TEMPLATES[choice - 1];
        if (selectedTemplate) {
          resolve(selectedTemplate.name);
        }
      } else {
        logger.error(`Invalid choice. Please enter a number between 1 and ${TEMPLATES.length}.`);
        process.stdout.write('Select a template (1-4): ');
      }
    });
  });
}

/**
 * Handle the init command
 */
export async function handleInitCommand(
  agentName: string | undefined,
  options: {
    template?: string;
    yes?: boolean;
  }
): Promise<void> {
  try {
    // Determine agent directory path
    const agentPath = agentName
      ? path.resolve(process.cwd(), agentName)
      : process.cwd();

    const agentDirName = path.basename(agentPath);

    // Check if directory is empty FIRST, before printing any initialization info
    const isEmpty = await isDirectoryEmpty(agentPath);
    if (!isEmpty) {
      logger.divider();
      logger.error('Directory is not empty!');
      logger.error('Delta Engine can only initialize agents in empty directories.');
      logger.error('Please use a different directory or clean the current one.');
      logger.divider();
      process.exit(1);
    }

    logger.divider();
    logger.info(`Initializing Delta Engine agent: ${agentDirName}`);
    logger.info(`Target directory: ${agentPath}`);

    // Determine which template to use
    let templateName: string;

    if (options.template) {
      // Template explicitly specified via -t
      templateName = options.template;
    } else if (options.yes) {
      // Silent mode: use minimal template
      templateName = 'minimal';
      logger.info('Silent mode (-y): Using minimal template');
    } else {
      // Default: prompt user to select
      templateName = await promptForTemplate();
    }

    // Get the template
    const template = getTemplate(templateName);
    if (!template) {
      logger.divider();
      logger.error(`Template '${templateName}' not found!`);
      logger.error('Available templates:');
      TEMPLATES.forEach(t => logger.error(`  - ${t.name}`));
      logger.divider();
      process.exit(1);
    }

    logger.divider();
    logger.info(`Creating agent from template: ${template.name}`);
    logger.info(template.description);

    // Create the agent
    await createAgentFromTemplate(agentPath, template, agentDirName);

    logger.divider();
    logger.success('Agent initialized successfully!');
    logger.divider();

    // Show created files
    logger.info('Created files:');
    logger.info(`  • config.yaml`);
    logger.info(`  • system_prompt.md`);
    logger.info(`  • README.md`);

    logger.divider();
    logger.info('Next steps:');

    // Generate run command based on whether we created a subdirectory
    if (agentName) {
      console.log(`  delta run --agent ${agentName} --task "Your task description here"`);
    } else {
      console.log(`  delta run --agent . --task "Your task description here"`);
    }

    logger.divider();
    logger.info('For more information, see: https://github.com/agent-works/delta-engine');
    logger.divider();

  } catch (error) {
    logger.divider();
    logger.error('Failed to initialize agent');

    if (error instanceof Error) {
      logger.error(error.message);
    } else {
      logger.error(String(error));
    }

    logger.divider();
    process.exit(1);
  }
}
