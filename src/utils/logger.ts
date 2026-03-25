import chalk from 'chalk';

export function info(msg: string): void {
  console.log(chalk.cyan(msg));
}

export function success(msg: string): void {
  console.log(chalk.green(msg));
}

export function warn(msg: string): void {
  console.log(chalk.yellow(msg));
}

export function error(msg: string): void {
  console.log(chalk.red(msg));
}

export function header(msg: string): void {
  console.log(chalk.bold.white(msg));
}

export function dim(msg: string): void {
  console.log(chalk.dim(msg));
}

export function layerOutput(label: string, detail: string): void {
  console.log(`  ${chalk.cyan(label.padEnd(28))} ${detail}`);
}
