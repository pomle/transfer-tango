const expect = require('expect.js');
const sinon = require('sinon');

const fs = require('fs');
const path = require('path');
const {Readable, Writable} = require('stream');

const {hash} = require('../stream');
const Store = require('../Store');

function FakeAdapter() {
  this.files = new Map();

  this.getStream = sinon.spy(name => {
    const stream = new Readable();
    const data = this.files.get(name);
    stream.push(data);
    stream.push(null);
    return stream;
  });

  this.putStream = sinon.spy((name, stream) => {
    const output = new Writable();
    let buffer = new Buffer('');
    sinon.stub(output, '_write').callsFake(data => {
      buffer = Buffer.concat([buffer, data]);
    });
    sinon.stub(output, 'end').callsFake((...args) => {
      this.files.set(name, buffer);
      Reflect.apply(output.end.wrappedMethod, output, args);
      setTimeout(() => output.emit('finish'));
    });
    return stream.pipe(output);
  });
}

describe('Store', () => {
  const MOCK_ID = 'Aa12xea2';
  let store;

  beforeEach(() => {
    store = new Store(new FakeAdapter());
    sinon.stub(store, 'createId').callsFake(() => 'Aa12xea2');
  });

  describe('when storing stream', () => {
    let storePromise;

    beforeEach(done => {
      // Start writing file.
      const file = fs.createReadStream(path.join(__dirname, 'fixtures', 'photo.jpg'));
      storePromise = store.store(file, {
        mime: 'image/jpg',
        filename: 'other_filename.png',
      });

      storePromise.then(receipt => {
        receipt.streams.meta.then(stream => {
          stream.on('finish', () => {
            // Done writing file.
            done();
          });
        });
      });
    });

    it('returns a Promise', () => {
      expect(storePromise).to.be.a(Promise);
    });

    describe('when resolved', () => {
      let receipt;

      beforeEach(() => {
        return storePromise.then(response => {
          receipt = response;
        });
      });

      it('contains a receipt', () => {
        expect(receipt).to.be.an(Object);
      });

      describe('Receipt', () => {
        it('contains file id', () => {
          expect(receipt.id).to.equal(MOCK_ID);
        });

        it('contains secret', () => {
          expect(receipt.secret.length).to.be(64);
        });

        it('contains streams', () => {
          expect(receipt.streams).to.be.ok();
        });

        describe('when used to retreive file', () => {
          let retreivePromise;

          beforeEach(() => {
            retreivePromise = store.retrieve(receipt.id, receipt.secret);
          });

          it('returns a Promise', () => {
            expect(retreivePromise).to.be.a(Promise);
          });

          describe('when resolved', () => {
            let result;

            beforeEach(() => {
              return retreivePromise.then(_r => {
                result = _r;
              });
            });

            it('contains meta', () => {
              expect(result.meta).to.be.an(Object);
            });

            describe('Meta', () => {
              let meta;

              beforeEach(() => {
                meta = result.meta;
              });

              it('has mime type', () => {
                expect(meta.mime).to.equal('image/jpg');
              });

              it('contains filename', () => {
                expect(meta.filename).to.equal('other_filename.png');
              });

              it('contains filesize', () => {
                expect(meta.size).to.equal(32489);
              });
            });

            it('contains stream with expected data', () => {
              return hash(result.stream, 'sha1').then(digest => {
                expect(digest).to.be('da39a3ee5e6b4b0d3255bfef95601890afd80709');
              });
            });
          });
        });
      });
    });
  });
});