module.exports = function (grunt) {

	grunt.loadNpmTasks('grunt-ts')
	grunt.loadNpmTasks('grunt-contrib-watch')

	grunt.initConfig({
		ts: {
			test: {                                 // a particular target
				src: ["lib/songbird.ts"],        // The source typescript files, http://gruntjs.com/configuring-tasks#files
				outDir: "./",
				options: {                    // use to override the default options, http://gruntjs.com/configuring-tasks#options
					target: 'es5',         // 'es3' (default) | 'es5'
					module: 'commonjs',       // 'amd' (default) | 'commonjs'
					declaration: false,       // true | false  (default)
					verbose: true
				}
			}
		},
		watch: {
			files: ["lib/songbird.ts"],
			tasks: ['ts']
		}
	})

	grunt.registerTask('default', ['ts']);
}