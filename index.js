import fs from 'fs';
import path from 'path';

class TsFileAnalyzer {
	constructor() {
		this.ignoredDirs = new Set([
			'node_modules', 'dist', 'build', '.git', '.vscode', '.idea',
			'.next', 'coverage', '.nyc_output', 'out', 'lib'
		]);
		this.gitignorePatterns = [];
		this.loadGitignore();
	}

	// 读取并解析 .gitignore 文件
	loadGitignore() {
		const gitignorePath = path.join(process.cwd(), '.gitignore');

		if (!fs.existsSync(gitignorePath)) return;

		try {
		const content = fs.readFileSync(gitignorePath, 'utf8');
		this.gitignorePatterns = content
			.split('\n')
			.map(line => line.trim())
			.filter(line => line && !line.startsWith('#'))
			.map(pattern => this.convertGitignoreToRegex(pattern));
		} catch (error) {
			console.warn('无法读取 .gitignore 文件:', error.message);
		}
	}

	// 将 gitignore 模式转换为正则表达式
	convertGitignoreToRegex(pattern) {
		let regexPattern = pattern
			.replace(/\./g, '\\.')
			.replace(/\*/g, '[^/]*')
			.replace(/\*\*/g, '.*');

		if (pattern.endsWith('/')) {
			regexPattern = regexPattern.slice(0, -1) + '(/.*)?$';
		}

		return new RegExp(regexPattern);
	}

	// 检查路径是否应该被忽略
	shouldIgnorePath(relativePath, isDirectory = false) {
		const pathParts = relativePath.split(path.sep);
		if (pathParts.some(part => this.ignoredDirs.has(part))) {
			return true;
		}

		return this.gitignorePatterns.some(regex => regex.test(relativePath));
	}

	// 递归查找所有 ts 和 tsx 文件
	findTsFiles(dir = process.cwd(), files = []) {
		try {
		const items = fs.readdirSync(dir, { withFileTypes: true });

		for (const item of items) {
			const fullPath = path.join(dir, item.name);
			const relativePath = path.relative(process.cwd(), fullPath);

			if (this.shouldIgnorePath(relativePath, item.isDirectory())) {
				continue;
			}

			if (item.isDirectory()) {
				this.findTsFiles(fullPath, files);
			} else if (item.isFile() && /\.(ts|tsx)$/.test(item.name)) {
				files.push({
					fullPath,
					relativePath,
					name: item.name
				});
			}
		}
		} catch (error) {
			console.warn(`无法读取目录: ${dir} - ${error.message}`);
		}

		return files;
	}

	analyzeFile(filePath) {
		try {
			const content = fs.readFileSync(filePath, 'utf8');
			const lines = content.split('\n');

		return {
			totalLines: lines.length,
			...this.countCodeLines(lines),
			fileSize: fs.statSync(filePath).size
		};
		} catch (error) {
			console.error(`读取文件失败: ${filePath} - ${error.message}`);
			return {
				totalLines: 0,
				codeLines: 0,
				commentLines: 0,
				emptyLines: 0,
				importLines: 0,
				fileSize: 0
			};
		}
	}

	countCodeLines(lines) {
		let codeLines = 0;
		let commentLines = 0;
		let emptyLines = 0;
		let importLines = 0;
		let inMultiLineComment = false;

		for (const line of lines) {
			const trimmedLine = line.trim();

			if (trimmedLine === '') {
				emptyLines++;
				continue;
			}

			let processedLine = trimmedLine;
			let hasCode = false;

			// 处理多行注释
			if (inMultiLineComment) {
				if (processedLine.includes('*/')) {
					inMultiLineComment = false;
					processedLine = processedLine.split('*/').slice(1).join('*/').trim();
				} else {
					commentLines++;
					continue;
				}
			}

			// 检查多行注释开始
			if (processedLine.includes('/*') && !processedLine.match(/\/\*.*\*\//)) {
				const beforeComment = processedLine.split('/*')[0].trim();
				if (beforeComment) hasCode = true;
				inMultiLineComment = true;
				commentLines++;
				if (hasCode) codeLines++;
				continue;
			}

			// 单行多行注释 /* ... */
			if (processedLine.match(/\/\*.*\*\//)) {
				processedLine = processedLine.replace(/\/\*.*?\*\//g, '').trim();
				commentLines++;
			}

			// 单行注释
			if (processedLine.startsWith('//')) {
				commentLines++;
				continue;
			}

			// 含有单行注释的代码行
			if (processedLine.includes('//')) {
				processedLine = processedLine.split('//')[0].trim();
				commentLines++;
			}

			if (processedLine) {
				hasCode = true;
				if (/^(import|export)\s/.test(processedLine)) {
					importLines++;
				}
			}

			if (hasCode) {
				codeLines++;
			}
		}

		return {
			codeLines,
			commentLines,
			emptyLines,
			importLines
		};
	}

	formatFileSize(bytes) {
		const units = ['B', 'KB', 'MB', 'GB'];
		let size = bytes;
		let unitIndex = 0;

		while (size >= 1024 && unitIndex < units.length - 1) {
			size /= 1024;
			unitIndex++;
		}

		return `${size.toFixed(1)} ${units[unitIndex]}`;
	}

	generateReport(fileStats) {
		const totalFiles = fileStats.length;
		const totals = fileStats.reduce((acc, file) => ({
			totalLines: acc.totalLines + file.totalLines,
			codeLines: acc.codeLines + file.codeLines,
			commentLines: acc.commentLines + file.commentLines,
			emptyLines: acc.emptyLines + file.emptyLines,
			importLines: acc.importLines + file.importLines,
			fileSize: acc.fileSize + file.fileSize
		}), {
			totalLines: 0,
			codeLines: 0,
			commentLines: 0,
			emptyLines: 0,
			importLines: 0,
			fileSize: 0
		});

		console.log('📊 TypeScript 项目代码统计报告');
		console.log('='.repeat(60));
		console.log(`📁 总文件数: ${totalFiles.toLocaleString()}`);
		console.log(`📏 总行数: ${totals.totalLines.toLocaleString()}`);
		console.log(`💾 总文件大小: ${this.formatFileSize(totals.fileSize)}`);
		console.log();

		console.log('📈 行数分布:');
		console.log(`  🔧 代码行: ${totals.codeLines.toLocaleString()} (${((totals.codeLines/totals.totalLines)*100).toFixed(1)}%)`);
		console.log(`  💬 注释行: ${totals.commentLines.toLocaleString()} (${((totals.commentLines/totals.totalLines)*100).toFixed(1)}%)`);
		console.log(`  📦 导入行: ${totals.importLines.toLocaleString()} (${((totals.importLines/totals.totalLines)*100).toFixed(1)}%)`);
		console.log(`  ⬜ 空行: ${totals.emptyLines.toLocaleString()} (${((totals.emptyLines/totals.totalLines)*100).toFixed(1)}%)`);
		console.log();

		console.log('📊 平均值:');
		console.log(`  📏 平均总行数: ${Math.round(totals.totalLines / totalFiles)} 行/文件`);
		console.log(`  🔧 平均代码行数: ${Math.round(totals.codeLines / totalFiles)} 行/文件`);
		console.log(`  💾 平均文件大小: ${this.formatFileSize(totals.fileSize / totalFiles)}`);
		console.log();
	}

	showRankings(fileStats, sortBy = 'totalLines', limit = 10) {
		const sortedFiles = [...fileStats].sort((a, b) => b[sortBy] - a[sortBy]);
		const titles = {
			codeLines: '🔧 代码行数排行榜',
		};

		console.log(titles[sortBy] || `📊 ${sortBy} 排行榜`);
		console.log('='.repeat(60));

		sortedFiles.slice(0, limit).forEach((file, index) => {
			console.log(`${index + 1}. ${file.relativePath}`);
			console.log(`   📏 ${file.totalLines} 行 | 🔧 ${file.codeLines} 代码 | 💬 ${file.commentLines} 注释`);
			console.log(`   💾 ${this.formatFileSize(file.fileSize)} | ⬜ ${file.emptyLines} 空行`);
			console.log();
		});
	}

	async analyze() {
		console.log('🔍 正在分析 TypeScript 文件...\n');

		const tsFiles = this.findTsFiles();

		if (tsFiles.length === 0) {
			console.log('❌ 未找到任何 TypeScript 文件');
			return;
		}

		console.log(`✅ 找到 ${tsFiles.length} 个 TypeScript 文件`);
		console.log('📊 正在分析文件内容...\n');

		const fileStats = tsFiles.map(file => ({
			...file,
			...this.analyzeFile(file.fullPath)
		})).filter(file => file.totalLines > 0);

		this.generateReport(fileStats);

		this.showRankings(fileStats, 'codeLines', 5);
	}
}

const analyzer = new TsFileAnalyzer();
analyzer.analyze().catch(console.error);
