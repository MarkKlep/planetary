import { assert } from 'chai';
import request from 'supertest';
import { setColor, readBinaryFile, app } from '../src/index.js';

describe('setColor', function() {
    it('cold temperature', function() {
        assert.equal(setColor(1), 'blue');
    })

    it('hot temperature', function() {
        assert.equal(setColor(90), 'orange');
    })

    it('cool temperature', function() {
        assert.equal(setColor(50), 'lime');
    })
});


describe("readBinaryFile", function() {
    it("test reading file", async function() {
      const filePath = "../sst.grid";
      try {
        const data = await readBinaryFile(filePath);
        assert.instanceOf(data, Buffer);
      } catch (error) {
        assert.fail(error.message);
      }
    });
});


describe('GET /api/data', function() {
    it('GET request response status 200', function(done) {
      request(app)
        .get('/api/data')
        .expect(200)
        .end(function(err, res) {
          if (err) return done(err);
          done();
        });
    });
});
