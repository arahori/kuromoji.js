'use strict';
import * as fs from 'fs';
import gulp from 'gulp';
import { deleteAsync } from 'del';
import * as sequence from 'run-sequence';
import * as eventStream from 'event-stream';
import * as jshint from 'gulp-jshint';
import browserify from 'browserify';
import source from 'vinyl-source-stream';
import * as gzip from 'gulp-gzip';
import * as mocha from 'gulp-mocha';
import * as istanbul from 'gulp-istanbul';
import * as webserver from 'gulp-webserver';
import * as jsdoc from 'gulp-jsdoc3';
import * as bower from 'gulp-bower';
import * as ghPages from 'gulp-gh-pages-will';
import * as bump from 'gulp-bump';
import minimist from 'minimist';
const argv = minimist(process.argv.slice(2));
// import argv = require('minimist')(process.argv.slice(2));
import * as git from 'gulp-git';

gulp.task('clean', (done) => {
  return deleteAsync(['.publish/', 'coverage/', 'build/', 'publish/'], done);
});

// gulp.task('build', gulp.series('clean'), () => {
gulp.task('build', () => {
  console.log('aaaa');
  const result = browserify({
    entries: ['src/kuromoji.js'],
    standalone: 'kuromoji', // window.kuromoji
  })
    .bundle()
    .pipe(source('kuromoji.js'))
    .pipe(gulp.dest('build/'));
  console.log(result);
  return result;
});

gulp.task('watch', () => {
  gulp.watch(['src/**/*.js', 'test/**/*.js'], ['lint', 'build', 'jsdoc']);
});

gulp.task('clean-dict', (done) => {
  return deleteAsync(['dict/'], done);
});

gulp.task('create-dat-files', (done) => {
  const IPADic = require('mecab-ipadic-seed');
  const kuromoji = require('./src/kuromoji.js');

  if (!fs.existsSync('dict/')) {
    fs.mkdirSync('dict/');
  }

  // To node.js Buffer
  function toBuffer(typed) {
    var ab = typed.buffer;
    var buffer = new Buffer(ab.byteLength);
    var view = new Uint8Array(ab);
    for (var i = 0; i < buffer.length; ++i) {
      buffer[i] = view[i];
    }
    return buffer;
  }

  const dic = new IPADic();
  const builder = kuromoji.dictionaryBuilder();

  // Build token info dictionary
  const tokenInfoPromise = dic
    .readTokenInfo((line) => {
      builder.addTokenInfoDictionary(line);
    })
    .then(() => {
      console.log('Finishied to read token info dics');
    });

  // Build connection costs matrix
  const matrixDefPromise = dic
    .readMatrixDef((line) => {
      builder.putCostMatrixLine(line);
    })
    .then(() => {
      console.log('Finishied to read matrix.def');
    });

  // Build unknown dictionary
  const unkDefPromise = dic
    .readUnkDef((line) => {
      builder.putUnkDefLine(line);
    })
    .then(() => {
      console.log('Finishied to read unk.def');
    });

  // Build character definition dictionary
  const charDefPromise = dic
    .readCharDef((line) => {
      builder.putCharDefLine(line);
    })
    .then(() => {
      console.log('Finishied to read char.def');
    });

  // Build kuromoji.js binary dictionary
  Promise.all([
    tokenInfoPromise,
    matrixDefPromise,
    unkDefPromise,
    charDefPromise,
  ])
    .then(() => {
      console.log('Finishied to read all seed dictionary files');
      console.log('Building binary dictionary ...');
      return builder.build();
    })
    .then((dic) => {
      const base_buffer = toBuffer(dic.trie.bc.getBaseBuffer());
      const check_buffer = toBuffer(dic.trie.bc.getCheckBuffer());
      const token_info_buffer = toBuffer(
        dic.token_info_dictionary.dictionary.buffer
      );
      const tid_pos_buffer = toBuffer(
        dic.token_info_dictionary.pos_buffer.buffer
      );
      const tid_map_buffer = toBuffer(
        dic.token_info_dictionary.targetMapToBuffer()
      );
      const connection_costs_buffer = toBuffer(dic.connection_costs.buffer);
      const unk_buffer = toBuffer(dic.unknown_dictionary.dictionary.buffer);
      const unk_pos_buffer = toBuffer(dic.unknown_dictionary.pos_buffer.buffer);
      const unk_map_buffer = toBuffer(
        dic.unknown_dictionary.targetMapToBuffer()
      );
      const char_map_buffer = toBuffer(
        dic.unknown_dictionary.character_definition.character_category_map
      );
      const char_compat_map_buffer = toBuffer(
        dic.unknown_dictionary.character_definition.compatible_category_map
      );
      const invoke_definition_map_buffer = toBuffer(
        dic.unknown_dictionary.character_definition.invoke_definition_map.toBuffer()
      );

      fs.writeFileSync('dict/base.dat', base_buffer);
      fs.writeFileSync('dict/check.dat', check_buffer);
      fs.writeFileSync('dict/tid.dat', token_info_buffer);
      fs.writeFileSync('dict/tid_pos.dat', tid_pos_buffer);
      fs.writeFileSync('dict/tid_map.dat', tid_map_buffer);
      fs.writeFileSync('dict/cc.dat', connection_costs_buffer);
      fs.writeFileSync('dict/unk.dat', unk_buffer);
      fs.writeFileSync('dict/unk_pos.dat', unk_pos_buffer);
      fs.writeFileSync('dict/unk_map.dat', unk_map_buffer);
      fs.writeFileSync('dict/unk_char.dat', char_map_buffer);
      fs.writeFileSync('dict/unk_compat.dat', char_compat_map_buffer);
      fs.writeFileSync('dict/unk_invoke.dat', invoke_definition_map_buffer);

      done();
    });
});

gulp.task('compress-dict', () => {
  return gulp.src('dict/*.dat').pipe(gzip()).pipe(gulp.dest('dict/'));
});

gulp.task('clean-dat-files', (done) => {
  return deleteAsync(['dict/*.dat'], done);
});

gulp.task(
  'build-dict',
  gulp.series(gulp.parallel('build', 'clean-dict')),
  () => {
    sequence('create-dat-files', 'compress-dict', 'clean-dat-files');
  }
);

gulp.task('test', gulp.series(gulp.parallel('build')), () => {
  return gulp
    .src('test/**/*.js', { read: false })
    .pipe(mocha({ reporter: 'list' }));
});

gulp.task('coverage', gulp.series(gulp.parallel('test')), (done) => {
  gulp
    .src(['src/**/*.js'])
    .pipe(istanbul())
    .pipe(istanbul.hookRequire())
    .on('finish', () => {
      gulp
        .src(['test/**/*.js'])
        .pipe(mocha({ reporter: 'mocha-lcov-reporter' }))
        .pipe(istanbul.writeReports())
        .on('end', done);
    });
});

gulp.task('lint', () => {
  return gulp
    .src(['src/**/*.js'])
    .pipe(jshint())
    .pipe(jshint.reporter('default'));
});

gulp.task('clean-jsdoc', (done) => {
  return deleteAsync(['publish/jsdoc/'], done);
});

gulp.task('jsdoc', gulp.series(gulp.parallel('clean-jsdoc')), (cb) => {
  var config = require('./jsdoc.json');
  gulp.src(['src/**/*.js'], { read: false }).pipe(jsdoc(config, cb));
});

gulp.task('clean-demo', (done) => {
  return deleteAsync(['publish/demo/'], done);
});

gulp.task(
  'copy-demo',
  gulp.series(gulp.parallel('clean-demo', 'build')),
  () => {
    return eventStream.merge(
      gulp.src('demo/**/*').pipe(gulp.dest('publish/demo/')),
      gulp.src('build/**/*').pipe(gulp.dest('publish/demo/kuromoji/build/')),
      gulp.src('dict/**/*').pipe(gulp.dest('publish/demo/kuromoji/dict/'))
    );
  }
);

gulp.task('build-demo', gulp.series(gulp.parallel('copy-demo')), () => {
  return bower({ cwd: 'publish/demo/' });
});

gulp.task(
  'webserver',
  gulp.series(gulp.parallel('build-demo', 'jsdoc')),
  () => {
    gulp.src('publish/').pipe(
      webserver({
        port: 8000,
        livereload: true,
        directoryListing: true,
      })
    );
  }
);

gulp.task('deploy', gulp.series(gulp.parallel('build-demo', 'jsdoc')), () => {
  return gulp.src('publish/**/*').pipe(ghPages());
});

gulp.task('version', function () {
  let type = 'patch';
  if (argv['minor']) {
    type = 'minor';
  }
  if (argv['major']) {
    type = 'major';
  }
  if (argv['prerelease']) {
    type = 'prerelease';
  }
  return gulp
    .src(['./bower.json', './package.json'])
    .pipe(bump({ type: type }))
    .pipe(gulp.dest('./'));
});

gulp.task('release-commit', function () {
  var version = JSON.parse(fs.readFileSync('./package.json', 'utf8')).version;
  return gulp
    .src('.')
    .pipe(git.add())
    .pipe(git.commit(`chore: release ${version}`));
});

gulp.task('release-tag', function (callback) {
  var version = JSON.parse(fs.readFileSync('./package.json', 'utf8')).version;
  git.tag(version, `${version} release`, function (error) {
    if (error) {
      return callback(error);
    }
    callback();
  });
});

gulp.task('release', gulp.series(gulp.parallel('test')), () => {
  sequence('release-commit', 'release-tag');
});
